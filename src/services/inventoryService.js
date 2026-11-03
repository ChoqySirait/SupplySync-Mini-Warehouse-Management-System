/**
 * SupplySync WMS - Core Inventory, FEFO Engine, & Picking Route Service
 * Mengelola alokasi First-Expired, First-Out (FEFO), concurrency locking,
 * batch traceability, dan instruksi lokasi rak gudang (Bin Picking Route).
 */

/**
 * Algoritma Murni Alokasi FEFO (Dapat diuji secara unit testing tanpa DB)
 * @param {Array<{batch_id: number, quantity: number, expired_date: string|Date, received_date?: string|Date}>} batches
 * @param {number} requiredQty
 * @returns {{ allocations: Array<{batch_id: number, deducted: number, remaining: number}>, totalAllocated: number, fulfilled: boolean }}
 */
function allocateFefoBatches(batches, requiredQty) {
    if (!batches || !Array.isArray(batches) || requiredQty <= 0) {
        return { allocations: [], totalAllocated: 0, fulfilled: false };
    }

    // Urutkan secara deterministik: expired_date ASC, lalu received_date ASC, lalu batch_id ASC
    const sorted = [...batches]
        .filter(b => b.quantity > 0)
        .sort((a, b) => {
            const dateA = new Date(a.expired_date).getTime();
            const dateB = new Date(b.expired_date).getTime();
            if (dateA !== dateB) return dateA - dateB;

            const recA = a.received_date ? new Date(a.received_date).getTime() : 0;
            const recB = b.received_date ? new Date(b.received_date).getTime() : 0;
            if (recA !== recB) return recA - recB;

            return a.batch_id - b.batch_id;
        });

    let remainingNeeded = requiredQty;
    const allocations = [];

    for (const batch of sorted) {
        if (remainingNeeded <= 0) break;

        const deduct = Math.min(batch.quantity, remainingNeeded);
        allocations.push({
            batch_id: batch.batch_id,
            batch_code: batch.batch_code || `BATCH-${batch.batch_id}`,
            expired_date: batch.expired_date,
            deducted: deduct,
            remaining: batch.quantity - deduct,
            location_id: batch.location_id || null,
            location_code: batch.location_code || 'A-01-01',
            zone_name: batch.zone_name || 'Area Umum',
            aisle: batch.aisle || 'Lorong 1',
            rack: batch.rack || 'Rak 1',
            tier: batch.tier || 'Tingkat 1',
            bin: batch.bin || 'Bin 1'
        });

        remainingNeeded -= deduct;
    }

    const totalAllocated = requiredQty - remainingNeeded;
    return {
        allocations,
        totalAllocated,
        fulfilled: remainingNeeded === 0
    };
}

/**
 * Generate Reference Number unik untuk transaksi WMS
 * Format: TRX-{TYPE}-{YYYYMMDD}-{RANDOM4}
 */
function generateReferenceNumber(type) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomHex = Math.floor(1000 + Math.random() * 9000).toString();
    return `TRX-${type.toUpperCase()}-${dateStr}-${randomHex}`;
}

/**
 * 1. Proses Penerimaan Barang Masuk (Stock Inbound)
 */
async function processStockIn(connection, { product_id, quantity, expired_date, supplier_id, location_id, notes, user_id, batch_code }) {
    // 1. Kunci produk dan periksa status aktif
    const [products] = await connection.query(
        `SELECT product_id, product_name, is_active FROM products WHERE product_id = ? FOR UPDATE`,
        [product_id]
    );

    if (!products || products.length === 0) {
        throw new Error(`Produk dengan SKU '${product_id}' tidak ditemukan di database.`);
    }

    if (!products[0].is_active) {
        throw new Error(`Produk '${products[0].product_name}' (${product_id}) berstatus non-aktif.`);
    }

    const today = new Date().toISOString().split('T')[0];
    const generatedBatchCode = batch_code || `BTC-${product_id}-${Date.now().toString().slice(-6)}`;
    const refNo = generateReferenceNumber('IN');

    // 2. Simpan batch baru ke inventory_batches lengkap dengan lokasi rak
    const [batchResult] = await connection.query(
        `INSERT INTO inventory_batches (batch_code, product_id, supplier_id, location_id, initial_quantity, quantity, expired_date, received_date, notes) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [generatedBatchCode, product_id, supplier_id || null, location_id || null, quantity, quantity, expired_date, today, notes || null]
    );

    const newBatchId = batchResult.insertId;

    // 3. Catat transaksi utama ke stock_transactions
    const [trxResult] = await connection.query(
        `INSERT INTO stock_transactions (reference_no, product_id, user_id, transaction_type, quantity, notes) 
         VALUES (?, ?, ?, 'IN', ?, ?)`,
        [refNo, product_id, user_id || 1, quantity, notes || 'Penerimaan batch barang masuk']
    );

    const transactionId = trxResult.insertId;

    // 4. Catat rincian alokasi batch ke stock_transaction_items (Audit Traceability)
    await connection.query(
        `INSERT INTO stock_transaction_items (transaction_id, batch_id, quantity) VALUES (?, ?, ?)`,
        [transactionId, newBatchId, quantity]
    );

    return {
        transaction_id: transactionId,
        reference_no: refNo,
        batch_id: newBatchId,
        batch_code: generatedBatchCode,
        product_name: products[0].product_name,
        quantity,
        expired_date,
        location_id: location_id || null
    };
}

/**
 * 2. Proses Pengeluaran Barang Otomatis FEFO & Pembuatan Picking Slip (Stock Outflow)
 */
async function processStockOutFefo(connection, { product_id, quantity, user_id, notes, allow_expired = false }) {
    // 1. Kunci baris master produk untuk mencegah race condition / deadlocks
    const [products] = await connection.query(
        `SELECT product_id, product_name, is_active FROM products WHERE product_id = ? FOR UPDATE`,
        [product_id]
    );

    if (!products || products.length === 0) {
        throw new Error(`Produk dengan SKU '${product_id}' tidak ditemukan di database.`);
    }

    if (!products[0].is_active) {
        throw new Error(`Produk '${products[0].product_name}' (${product_id}) berstatus non-aktif.`);
    }

    // 2. Ambil seluruh batch aktif terurut FEFO dengan lokasi rak fisik
    let query = `
        SELECT 
            b.batch_id, 
            b.batch_code, 
            b.product_id, 
            b.quantity, 
            b.expired_date, 
            b.received_date,
            b.location_id,
            COALESCE(l.location_code, 'A-01-01') AS location_code,
            COALESCE(l.zone_name, 'Zona Penyimpanan Umum') AS zone_name,
            COALESCE(l.aisle, 'Lorong 1') AS aisle,
            COALESCE(l.rack, 'Rak 1') AS rack,
            COALESCE(l.tier, 'Tingkat 1') AS tier,
            COALESCE(l.bin, 'Bin 1') AS bin
        FROM inventory_batches b
        LEFT JOIN warehouse_locations l ON b.location_id = l.location_id
        WHERE b.product_id = ? AND b.quantity > 0
    `;
    const params = [product_id];

    if (!allow_expired) {
        query += ` AND b.expired_date >= CURDATE()`;
    }

    query += ` ORDER BY b.expired_date ASC, b.received_date ASC, b.batch_id ASC FOR UPDATE`;

    const [batches] = await connection.query(query, params);

    // 3. Periksa ketersediaan stok
    const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0);

    if (totalAvailable < quantity) {
        let extraInfo = '';
        if (!allow_expired) {
            const [[expiredCount]] = await connection.query(
                `SELECT COALESCE(SUM(quantity), 0) AS expired_stock 
                 FROM inventory_batches 
                 WHERE product_id = ? AND quantity > 0 AND expired_date < CURDATE()`,
                [product_id]
            );
            if (expiredCount && expiredCount.expired_stock > 0) {
                extraInfo = ` (${expiredCount.expired_stock} unit kedaluwarsa dan tidak dialokasikan untuk penjualan. Gunakan modul Disposal).`;
            }
        }

        throw new Error(
            `Stok tidak mencukupi untuk '${products[0].product_name}'. Stok siap pakai: ${totalAvailable}, diminta: ${quantity}.${extraInfo}`
        );
    }

    // 4. Hitung alokasi batch secara FEFO
    const { allocations } = allocateFefoBatches(batches, quantity);

    // 5. Catat transaksi utama
    const refNo = generateReferenceNumber('OUT');
    const [trxResult] = await connection.query(
        `INSERT INTO stock_transactions (reference_no, product_id, user_id, transaction_type, quantity, notes) 
         VALUES (?, ?, ?, 'OUT', ?, ?)`,
        [refNo, product_id, user_id || 1, quantity, notes || 'Pengeluaran barang alokasi FEFO']
    );

    const transactionId = trxResult.insertId;

    // 6. Eksekusi pemotongan setiap batch dan catat items
    for (const alloc of allocations) {
        await connection.query(
            `UPDATE inventory_batches SET quantity = ? WHERE batch_id = ?`,
            [alloc.remaining, alloc.batch_id]
        );

        await connection.query(
            `INSERT INTO stock_transaction_items (transaction_id, batch_id, quantity) VALUES (?, ?, ?)`,
            [transactionId, alloc.batch_id, alloc.deducted]
        );
    }

    // 7. Rute Pengambilan Rak (Picking Instructions) untuk staf gudang
    const pickingInstructions = allocations.map(a => ({
        batch_code: a.batch_code,
        quantity_to_pick: a.deducted,
        location: `${a.location_code} (${a.zone_name})`,
        path: `${a.aisle} > ${a.rack} > ${a.tier} > ${a.bin}`
    }));

    return {
        transaction_id: transactionId,
        reference_no: refNo,
        product_name: products[0].product_name,
        total_deducted: quantity,
        batches_affected: allocations,
        picking_instructions: pickingInstructions
    };
}

/**
 * 3. Modul Pembuangan Barang Afkir/Kedaluwarsa (Stock Disposal)
 */
async function processStockDisposal(connection, { product_id, quantity, reason, user_id }) {
    const [products] = await connection.query(
        `SELECT product_id, product_name, is_active FROM products WHERE product_id = ? FOR UPDATE`,
        [product_id]
    );

    if (!products || products.length === 0) {
        throw new Error(`Produk dengan SKU '${product_id}' tidak ditemukan di database.`);
    }

    const [batches] = await connection.query(
        `SELECT 
            b.batch_id, b.batch_code, b.product_id, b.quantity, b.expired_date, b.received_date,
            b.location_id, COALESCE(l.location_code, 'A-01-01') AS location_code, COALESCE(l.zone_name, 'Area Umum') AS zone_name
         FROM inventory_batches b
         LEFT JOIN warehouse_locations l ON b.location_id = l.location_id
         WHERE b.product_id = ? AND b.quantity > 0 
         ORDER BY b.expired_date ASC, b.received_date ASC, b.batch_id ASC 
         FOR UPDATE`,
        [product_id]
    );

    const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0);
    if (totalAvailable < quantity) {
        throw new Error(
            `Jumlah afkir (${quantity}) melebihi total stok yang tersedia (${totalAvailable}) untuk '${products[0].product_name}'.`
        );
    }

    const { allocations } = allocateFefoBatches(batches, quantity);

    const refNo = generateReferenceNumber('DISP');
    const [trxResult] = await connection.query(
        `INSERT INTO stock_transactions (reference_no, product_id, user_id, transaction_type, quantity, notes) 
         VALUES (?, ?, ?, 'DISPOSAL', ?, ?)`,
        [refNo, product_id, user_id || 1, quantity, `[DISPOSAL/AFKIR] ${reason}`]
    );

    const transactionId = trxResult.insertId;

    for (const alloc of allocations) {
        await connection.query(
            `UPDATE inventory_batches SET quantity = ? WHERE batch_id = ?`,
            [alloc.remaining, alloc.batch_id]
        );

        await connection.query(
            `INSERT INTO stock_transaction_items (transaction_id, batch_id, quantity) VALUES (?, ?, ?)`,
            [transactionId, alloc.batch_id, alloc.deducted]
        );
    }

    return {
        transaction_id: transactionId,
        reference_no: refNo,
        product_name: products[0].product_name,
        quantity,
        reason,
        batches_affected: allocations
    };
}

/**
 * 4. Modul Rekonsiliasi Stok Opname (Physical vs System Stock)
 */
async function processStockOpname(connection, { product_id, physical_stock, reason, user_id }) {
    const [products] = await connection.query(
        `SELECT product_id, product_name, is_active FROM products WHERE product_id = ? FOR UPDATE`,
        [product_id]
    );

    if (!products || products.length === 0) {
        throw new Error(`Produk dengan SKU '${product_id}' tidak ditemukan di database.`);
    }

    const [[sysStockRow]] = await connection.query(
        `SELECT COALESCE(SUM(quantity), 0) AS total_stock 
         FROM inventory_batches 
         WHERE product_id = ? AND quantity > 0`,
        [product_id]
    );

    const systemStock = parseInt(sysStockRow.total_stock, 10);
    const difference = physical_stock - systemStock;

    const opnameNumber = `OPN-${product_id}-${Date.now().toString().slice(-6)}`;

    const [opnameResult] = await connection.query(
        `INSERT INTO stock_opname (opname_number, product_id, system_stock, physical_stock, difference, reason, performed_by, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'APPROVED')`,
        [opnameNumber, product_id, systemStock, physical_stock, difference, reason, user_id || 1]
    );

    if (difference > 0) {
        const today = new Date().toISOString().split('T')[0];
        const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const batchCode = `BTC-ADJ-${product_id}-${Date.now().toString().slice(-5)}`;

        const [adjBatch] = await connection.query(
            `INSERT INTO inventory_batches (batch_code, product_id, initial_quantity, quantity, expired_date, received_date, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [batchCode, product_id, difference, difference, nextYear, today, `[STOCK OPNAME SURPLUS] ${reason}`]
        );

        const refNo = generateReferenceNumber('ADJ');
        const [adjTrx] = await connection.query(
            `INSERT INTO stock_transactions (reference_no, product_id, user_id, transaction_type, quantity, notes)
             VALUES (?, ?, ?, 'ADJUSTMENT', ?, ?)`,
            [refNo, product_id, user_id || 1, difference, `[OPNAME SURPLUS +${difference}] ${reason}`]
        );

        await connection.query(
            `INSERT INTO stock_transaction_items (transaction_id, batch_id, quantity) VALUES (?, ?, ?)`,
            [adjTrx.insertId, adjBatch.insertId, difference]
        );
    } else if (difference < 0) {
        const qtyToReduce = Math.abs(difference);

        const [batches] = await connection.query(
            `SELECT batch_id, batch_code, product_id, quantity, expired_date, received_date 
             FROM inventory_batches 
             WHERE product_id = ? AND quantity > 0 
             ORDER BY expired_date ASC, received_date ASC, batch_id ASC 
             FOR UPDATE`,
            [product_id]
        );

        const { allocations } = allocateFefoBatches(batches, qtyToReduce);

        const refNo = generateReferenceNumber('ADJ');
        const [adjTrx] = await connection.query(
            `INSERT INTO stock_transactions (reference_no, product_id, user_id, transaction_type, quantity, notes)
             VALUES (?, ?, ?, 'ADJUSTMENT', ?, ?)`,
            [refNo, product_id, user_id || 1, qtyToReduce, `[OPNAME DEFISIT -${qtyToReduce}] ${reason}`]
        );

        for (const alloc of allocations) {
            await connection.query(
                `UPDATE inventory_batches SET quantity = ? WHERE batch_id = ?`,
                [alloc.remaining, alloc.batch_id]
            );

            await connection.query(
                `INSERT INTO stock_transaction_items (transaction_id, batch_id, quantity) VALUES (?, ?, ?)`,
                [adjTrx.insertId, alloc.batch_id, alloc.deducted]
            );
        }
    }

    return {
        opname_id: opnameResult.insertId,
        opname_number: opnameNumber,
        product_name: products[0].product_name,
        system_stock: systemStock,
        physical_stock,
        difference,
        reason
    };
}

module.exports = {
    allocateFefoBatches,
    generateReferenceNumber,
    processStockIn,
    processStockOutFefo,
    processStockDisposal,
    processStockOpname
};
