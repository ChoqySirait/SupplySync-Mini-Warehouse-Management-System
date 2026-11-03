const db = require('../config/database');
const inventoryService = require('./inventoryService');
const crypto = require('crypto');

/**
 * Generator Nomor Referensi Unik PO & SO
 */
function generatePoNumber() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const randomHex = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `PO-${yyyy}${mm}${dd}-${randomHex}`;
}

function generateSoNumber() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const randomHex = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `SO-${yyyy}${mm}${dd}-${randomHex}`;
}

// ====================================================================
// 1. PURCHASE ORDER (PO) BUSINESS LOGIC
// ====================================================================

async function listPurchaseOrders(filters = {}) {
    let query = `
        SELECT po.po_id, po.po_number, po.supplier_id, s.supplier_name, s.supplier_code,
               po.facility_id, f.facility_code, f.facility_name,
               po.status, po.total_amount, po.order_date, po.expected_delivery_date,
               po.notes, po.created_at,
               u_cr.full_name AS created_by_name,
               u_ap.full_name AS approved_by_name,
               COUNT(poi.item_id) AS total_items,
               COALESCE(SUM(poi.ordered_quantity), 0) AS total_ordered_qty,
               COALESCE(SUM(poi.received_quantity), 0) AS total_received_qty
        FROM purchase_orders po
        JOIN suppliers s ON po.supplier_id = s.supplier_id
        JOIN warehouse_facilities f ON po.facility_id = f.facility_id
        LEFT JOIN users u_cr ON po.created_by = u_cr.user_id
        LEFT JOIN users u_ap ON po.approved_by = u_ap.user_id
        LEFT JOIN purchase_order_items poi ON po.po_id = poi.po_id
        WHERE 1=1
    `;
    const params = [];

    if (filters.status) {
        query += ` AND po.status = ?`;
        params.push(filters.status);
    }
    if (filters.supplier_id) {
        query += ` AND po.supplier_id = ?`;
        params.push(filters.supplier_id);
    }
    if (filters.facility_id) {
        query += ` AND po.facility_id = ?`;
        params.push(filters.facility_id);
    }

    query += ` GROUP BY po.po_id ORDER BY po.created_at DESC`;

    const [rows] = await db.query(query, params);
    return rows;
}

async function getPurchaseOrderById(po_id) {
    const [poRows] = await db.query(
        `SELECT po.*, s.supplier_name, s.supplier_code, s.contact_person, s.phone, s.email,
                f.facility_code, f.facility_name, f.city, f.address AS facility_address,
                u_cr.full_name AS created_by_name,
                u_ap.full_name AS approved_by_name
         FROM purchase_orders po
         JOIN suppliers s ON po.supplier_id = s.supplier_id
         JOIN warehouse_facilities f ON po.facility_id = f.facility_id
         LEFT JOIN users u_cr ON po.created_by = u_cr.user_id
         LEFT JOIN users u_ap ON po.approved_by = u_ap.user_id
         WHERE po.po_id = ?`,
        [po_id]
    );

    if (!poRows || poRows.length === 0) {
        throw new Error(`Pesanan Pembelian (PO) dengan ID ${po_id} tidak ditemukan.`);
    }

    const [items] = await db.query(
        `SELECT poi.*, p.product_name, p.category, p.unit
         FROM purchase_order_items poi
         JOIN products p ON poi.product_id = p.product_id
         WHERE poi.po_id = ?
         ORDER BY poi.item_id ASC`,
        [po_id]
    );

    return {
        ...poRows[0],
        items: items || []
    };
}

async function createPurchaseOrder(connection, { supplier_id, facility_id, items, expected_delivery_date, notes, user_id }) {
    if (!supplier_id) throw new Error('Supplier wajib dipilih untuk membuat Purchase Order.');
    if (!facility_id) throw new Error('Fasilitas gudang tujuan wajib dipilih.');
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Daftar item produk pada Purchase Order tidak boleh kosong.');
    }

    // Hitung total kalkulasi dan validasi tiap item
    let calculatedTotal = 0;
    const validatedItems = [];

    for (const it of items) {
        const qty = parseInt(it.ordered_quantity, 10);
        const cost = parseFloat(it.unit_cost || 0);

        if (!it.product_id) throw new Error('ID Produk pada setiap item PO wajib diisi.');
        if (isNaN(qty) || qty <= 0) {
            throw new Error(`Kuantitas pesan untuk produk '${it.product_id}' harus bilangan bulat positif.`);
        }
        if (isNaN(cost) || cost < 0) {
            throw new Error(`Harga pokok untuk produk '${it.product_id}' tidak valid.`);
        }

        calculatedTotal += qty * cost;
        validatedItems.push({
            product_id: it.product_id.trim().toUpperCase(),
            ordered_quantity: qty,
            unit_cost: cost
        });
    }

    const poNumber = generatePoNumber();
    const orderDate = new Date().toISOString().split('T')[0];

    const [poResult] = await connection.query(
        `INSERT INTO purchase_orders (po_number, supplier_id, facility_id, status, total_amount, order_date, expected_delivery_date, created_by, notes)
         VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)`,
        [poNumber, supplier_id, facility_id, calculatedTotal, orderDate, expected_delivery_date || null, user_id || 1, notes || null]
    );

    const poId = poResult.insertId;

    for (const item of validatedItems) {
        await connection.query(
            `INSERT INTO purchase_order_items (po_id, product_id, ordered_quantity, received_quantity, unit_cost)
             VALUES (?, ?, ?, 0, ?)`,
            [poId, item.product_id, item.ordered_quantity, item.unit_cost]
        );
    }

    return {
        po_id: poId,
        po_number: poNumber,
        status: 'DRAFT',
        total_amount: calculatedTotal,
        total_items: validatedItems.length
    };
}

async function approvePurchaseOrder(connection, po_id, user) {
    const [rows] = await connection.query(
        `SELECT * FROM purchase_orders WHERE po_id = ? FOR UPDATE`,
        [po_id]
    );
    if (!rows || rows.length === 0) {
        throw new Error(`Purchase Order #${po_id} tidak ditemukan.`);
    }

    const po = rows[0];
    if (po.status !== 'DRAFT') {
        throw new Error(`PO #${po.po_number} tidak dapat disetujui karena berstatus '${po.status}' (Hanya DRAFT yang dapat disetujui).`);
    }

    await connection.query(
        `UPDATE purchase_orders SET status = 'APPROVED', approved_by = ?, updated_at = NOW() WHERE po_id = ?`,
        [user.user_id, po_id]
    );

    return {
        po_id,
        po_number: po.po_number,
        status: 'APPROVED',
        approved_by: user.user_id
    };
}

async function receivePurchaseOrder(connection, po_id, { items, notes, user_id }) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Daftar barang yang diterima pada PO tidak boleh kosong.');
    }

    const [poRows] = await connection.query(
        `SELECT * FROM purchase_orders WHERE po_id = ? FOR UPDATE`,
        [po_id]
    );
    if (!poRows || poRows.length === 0) {
        throw new Error(`Purchase Order #${po_id} tidak ditemukan.`);
    }

    const po = poRows[0];
    if (po.status !== 'APPROVED' && po.status !== 'PARTIALLY_RECEIVED') {
        throw new Error(`PO #${po.po_number} tidak dapat diterima. Status saat ini: '${po.status}' (Harus APPROVED atau PARTIALLY_RECEIVED).`);
    }

    const [existingItems] = await connection.query(
        `SELECT * FROM purchase_order_items WHERE po_id = ? FOR UPDATE`,
        [po_id]
    );

    const itemMap = new Map();
    existingItems.forEach(i => itemMap.set(i.product_id, i));

    const receivedResults = [];

    for (const rec of items) {
        const prodId = (rec.product_id || '').trim().toUpperCase();
        const recQty = parseInt(rec.received_quantity, 10);

        if (!itemMap.has(prodId)) {
            throw new Error(`Produk '${prodId}' tidak terdaftar pada PO #${po.po_number}.`);
        }

        const currentPoItem = itemMap.get(prodId);
        const remainingToReceive = currentPoItem.ordered_quantity - currentPoItem.received_quantity;

        if (isNaN(recQty) || recQty <= 0) {
            throw new Error(`Kuantitas penerimaan produk '${prodId}' harus lebih besar dari 0.`);
        }
        if (recQty > remainingToReceive) {
            throw new Error(`Kuantitas diterima untuk '${prodId}' (${recQty}) melebihi sisa pesanan PO (${remainingToReceive}).`);
        }
        if (!rec.location_id) {
            throw new Error(`Lokasi rak gudang penerimaan untuk produk '${prodId}' wajib ditentukan.`);
        }
        if (!rec.expired_date) {
            throw new Error(`Tanggal kedaluwarsa untuk batch masuk '${prodId}' wajib diisi.`);
        }

        // 1. Tambah stok batch fisik via inventoryService
        const inResult = await inventoryService.processStockIn(connection, {
            product_id: prodId,
            quantity: recQty,
            expired_date: rec.expired_date,
            supplier_id: po.supplier_id,
            location_id: rec.location_id,
            batch_code: rec.batch_code || null,
            notes: `[Inbound PO #${po.po_number}] ${notes || ''}`.trim(),
            user_id: user_id || 1
        });

        // 2. Perbarui received_quantity pada PO item
        const updatedRecQty = currentPoItem.received_quantity + recQty;
        await connection.query(
            `UPDATE purchase_order_items SET received_quantity = ? WHERE item_id = ?`,
            [updatedRecQty, currentPoItem.item_id]
        );
        currentPoItem.received_quantity = updatedRecQty;

        receivedResults.push({
            product_id: prodId,
            received_quantity: recQty,
            batch_code: inResult.batch_code,
            reference_no: inResult.reference_no
        });
    }

    // 3. Evaluasi status akhir PO: Full Received vs Partially Received
    let allFulfilled = true;
    for (const item of itemMap.values()) {
        if (item.received_quantity < item.ordered_quantity) {
            allFulfilled = false;
            break;
        }
    }

    const newStatus = allFulfilled ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
    await connection.query(
        `UPDATE purchase_orders SET status = ?, updated_at = NOW() WHERE po_id = ?`,
        [newStatus, po_id]
    );

    return {
        po_id,
        po_number: po.po_number,
        status: newStatus,
        received_items: receivedResults
    };
}

async function cancelPurchaseOrder(connection, po_id, { reason, user }) {
    const [rows] = await connection.query(
        `SELECT * FROM purchase_orders WHERE po_id = ? FOR UPDATE`,
        [po_id]
    );
    if (!rows || rows.length === 0) {
        throw new Error(`Purchase Order #${po_id} tidak ditemukan.`);
    }

    const po = rows[0];
    if (po.status === 'RECEIVED') {
        throw new Error(`PO #${po.po_number} telah diterima penuh dan tidak dapat dibatalkan.`);
    }
    if (po.status === 'CANCELLED') {
        throw new Error(`PO #${po.po_number} sudah dibatalkan sebelumnya.`);
    }

    const updatedNotes = `[DIBATALKAN oleh ${user.full_name}: ${reason || 'Pembatalan pesanan'}] ${po.notes || ''}`.trim();

    await connection.query(
        `UPDATE purchase_orders SET status = 'CANCELLED', notes = ?, updated_at = NOW() WHERE po_id = ?`,
        [updatedNotes, po_id]
    );

    return {
        po_id,
        po_number: po.po_number,
        status: 'CANCELLED'
    };
}

// ====================================================================
// 2. SALES ORDER (SO) BUSINESS LOGIC
// ====================================================================

async function listSalesOrders(filters = {}) {
    let query = `
        SELECT so.so_id, so.so_number, so.facility_id, f.facility_code, f.facility_name,
               so.customer_name, so.customer_phone, so.customer_address,
               so.status, so.total_amount, so.order_date, so.delivery_date,
               so.notes, so.created_at,
               u_cr.full_name AS created_by_name,
               COUNT(soi.item_id) AS total_items,
               COALESCE(SUM(soi.requested_quantity), 0) AS total_requested_qty
        FROM sales_orders so
        JOIN warehouse_facilities f ON so.facility_id = f.facility_id
        LEFT JOIN users u_cr ON so.created_by = u_cr.user_id
        LEFT JOIN sales_order_items soi ON so.so_id = soi.so_id
        WHERE 1=1
    `;
    const params = [];

    if (filters.status) {
        query += ` AND so.status = ?`;
        params.push(filters.status);
    }
    if (filters.facility_id) {
        query += ` AND so.facility_id = ?`;
        params.push(filters.facility_id);
    }

    query += ` GROUP BY so.so_id ORDER BY so.created_at DESC`;

    const [rows] = await db.query(query, params);
    return rows;
}

async function getSalesOrderById(so_id) {
    const [soRows] = await db.query(
        `SELECT so.*, f.facility_code, f.facility_name, f.city,
                u_cr.full_name AS created_by_name
         FROM sales_orders so
         JOIN warehouse_facilities f ON so.facility_id = f.facility_id
         LEFT JOIN users u_cr ON so.created_by = u_cr.user_id
         WHERE so.so_id = ?`,
        [so_id]
    );

    if (!soRows || soRows.length === 0) {
        throw new Error(`Pesanan Penjualan (SO) dengan ID ${so_id} tidak ditemukan.`);
    }

    const [items] = await db.query(
        `SELECT soi.*, p.product_name, p.category, p.unit
         FROM sales_order_items soi
         JOIN products p ON soi.product_id = p.product_id
         WHERE soi.so_id = ?
         ORDER BY soi.item_id ASC`,
        [so_id]
    );

    return {
        ...soRows[0],
        items: items || []
    };
}

async function createSalesOrder(connection, { facility_id, customer_name, customer_phone, customer_address, items, delivery_date, notes, user_id }) {
    if (!facility_id) throw new Error('Fasilitas gudang asal pengiriman wajib ditentukan.');
    if (!customer_name || customer_name.trim().length === 0) {
        throw new Error('Nama pelanggan wajib diisi.');
    }
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Daftar item pesanan penjualan tidak boleh kosong.');
    }

    let calculatedTotal = 0;
    const validatedItems = [];

    for (const it of items) {
        const qty = parseInt(it.requested_quantity, 10);
        const price = parseFloat(it.unit_price || 0);

        if (!it.product_id) throw new Error('ID Produk pada item SO wajib diisi.');
        if (isNaN(qty) || qty <= 0) {
            throw new Error(`Kuantitas pesanan untuk produk '${it.product_id}' harus bilangan bulat positif.`);
        }
        if (isNaN(price) || price < 0) {
            throw new Error(`Harga jual untuk produk '${it.product_id}' tidak valid.`);
        }

        calculatedTotal += qty * price;
        validatedItems.push({
            product_id: it.product_id.trim().toUpperCase(),
            requested_quantity: qty,
            unit_price: price
        });
    }

    const soNumber = generateSoNumber();
    const orderDate = new Date().toISOString().split('T')[0];

    const [soResult] = await connection.query(
        `INSERT INTO sales_orders (so_number, facility_id, customer_name, customer_phone, customer_address, status, total_amount, order_date, delivery_date, created_by, notes)
         VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)`,
        [soNumber, facility_id, customer_name.trim(), customer_phone || null, customer_address || null, calculatedTotal, orderDate, delivery_date || null, user_id || 1, notes || null]
    );

    const soId = soResult.insertId;

    for (const item of validatedItems) {
        await connection.query(
            `INSERT INTO sales_order_items (so_id, product_id, requested_quantity, unit_price)
             VALUES (?, ?, ?, ?)`,
            [soId, item.product_id, item.requested_quantity, item.unit_price]
        );
    }

    return {
        so_id: soId,
        so_number: soNumber,
        status: 'DRAFT',
        total_amount: calculatedTotal,
        total_items: validatedItems.length
    };
}

async function confirmSalesOrder(connection, so_id, user) {
    const [rows] = await connection.query(
        `SELECT * FROM sales_orders WHERE so_id = ? FOR UPDATE`,
        [so_id]
    );
    if (!rows || rows.length === 0) {
        throw new Error(`Sales Order #${so_id} tidak ditemukan.`);
    }

    const so = rows[0];
    if (so.status !== 'DRAFT') {
        throw new Error(`SO #${so.so_number} tidak dapat dikonfirmasi karena berstatus '${so.status}' (Hanya DRAFT yang dapat dikonfirmasi).`);
    }

    await connection.query(
        `UPDATE sales_orders SET status = 'CONFIRMED', updated_at = NOW() WHERE so_id = ?`,
        [so_id]
    );

    return {
        so_id,
        so_number: so.so_number,
        status: 'CONFIRMED'
    };
}

async function dispatchSalesOrder(connection, so_id, { notes, user_id }) {
    const [soRows] = await connection.query(
        `SELECT * FROM sales_orders WHERE so_id = ? FOR UPDATE`,
        [so_id]
    );
    if (!soRows || soRows.length === 0) {
        throw new Error(`Sales Order #${so_id} tidak ditemukan.`);
    }

    const so = soRows[0];
    if (so.status !== 'CONFIRMED') {
        throw new Error(`SO #${so.so_number} tidak dapat dikirim/dispatch. Status saat ini: '${so.status}' (Harus CONFIRMED).`);
    }

    const [items] = await connection.query(
        `SELECT * FROM sales_order_items WHERE so_id = ? FOR UPDATE`,
        [so_id]
    );

    const dispatchedResults = [];

    // Proses pengeluaran FEFO untuk masing-masing item pesanan
    for (const item of items) {
        const outResult = await inventoryService.processStockOutFefo(connection, {
            product_id: item.product_id,
            quantity: item.requested_quantity,
            user_id: user_id || 1,
            notes: `[Dispatch SO #${so.so_number} ke ${so.customer_name}] ${notes || ''}`.trim()
        });

        dispatchedResults.push({
            product_id: item.product_id,
            product_name: outResult.product_name,
            total_deducted: outResult.total_deducted,
            reference_no: outResult.reference_no,
            batches: outResult.batches
        });
    }

    await connection.query(
        `UPDATE sales_orders SET status = 'DISPATCHED', updated_at = NOW() WHERE so_id = ?`,
        [so_id]
    );

    return {
        so_id,
        so_number: so.so_number,
        status: 'DISPATCHED',
        dispatched_items: dispatchedResults
    };
}

async function cancelSalesOrder(connection, so_id, { reason, user }) {
    const [rows] = await connection.query(
        `SELECT * FROM sales_orders WHERE so_id = ? FOR UPDATE`,
        [so_id]
    );
    if (!rows || rows.length === 0) {
        throw new Error(`Sales Order #${so_id} tidak ditemukan.`);
    }

    const so = rows[0];
    if (so.status === 'DISPATCHED') {
        throw new Error(`SO #${so.so_number} telah dikirim dan tidak dapat dibatalkan.`);
    }
    if (so.status === 'CANCELLED') {
        throw new Error(`SO #${so.so_number} sudah dibatalkan sebelumnya.`);
    }

    const updatedNotes = `[DIBATALKAN oleh ${user.full_name}: ${reason || 'Pembatalan pesanan pelanggan'}] ${so.notes || ''}`.trim();

    await connection.query(
        `UPDATE sales_orders SET status = 'CANCELLED', notes = ?, updated_at = NOW() WHERE so_id = ?`,
        [updatedNotes, so_id]
    );

    return {
        so_id,
        so_number: so.so_number,
        status: 'CANCELLED'
    };
}

module.exports = {
    generatePoNumber,
    generateSoNumber,
    listPurchaseOrders,
    getPurchaseOrderById,
    createPurchaseOrder,
    approvePurchaseOrder,
    receivePurchaseOrder,
    cancelPurchaseOrder,
    listSalesOrders,
    getSalesOrderById,
    createSalesOrder,
    confirmSalesOrder,
    dispatchSalesOrder,
    cancelSalesOrder
};
