const crypto = require('crypto');
const { allocateFefoBatches } = require('./inventoryService');

/**
 * SupplySync WMS - Inter-Warehouse Transfer & Multi-Facility Allocation Engine
 */

/**
 * Generate Transfer Reference Number Unik
 * Format: TRF-YYYYMMDD-XXXX
 */
function generateTransferNumber() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomHex = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `TRF-${dateStr}-${randomHex}`;
}

/**
 * 1. Mulai Pengiriman Transfer Antar-Gudang (Initiate Transfer Out)
 * Mengurangi stok dari batch gudang asal berbasis FEFO, mencatat status IN_TRANSIT
 */
async function initiateStockTransfer(connection, {
    source_facility_id,
    destination_facility_id,
    items,
    notes,
    user_id
}) {
    if (!source_facility_id || !destination_facility_id) {
        throw new Error('Gudang asal (source_facility_id) dan gudang tujuan (destination_facility_id) wajib ditentukan.');
    }

    if (parseInt(source_facility_id, 10) === parseInt(destination_facility_id, 10)) {
        throw new Error('Gudang asal dan gudang tujuan tidak boleh sama.');
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error('Daftar item produk transfer tidak boleh kosong.');
    }

    // Periksa keberadaan fasilitas asal dan tujuan
    const [facilities] = await connection.query(
        `SELECT facility_id, facility_name, facility_code FROM warehouse_facilities WHERE facility_id IN (?, ?)`,
        [source_facility_id, destination_facility_id]
    );

    if (facilities.length < 2) {
        throw new Error('Fasilitas gudang asal atau tujuan tidak ditemukan di database.');
    }

    const sourceFacility = facilities.find(f => f.facility_id === parseInt(source_facility_id, 10));
    const destFacility = facilities.find(f => f.facility_id === parseInt(destination_facility_id, 10));

    const transferNumber = generateTransferNumber();
    let totalSentQuantity = 0;
    const transferItemsToInsert = [];
    const auditTransactionsToRecord = [];

    // Proses alokasi FEFO untuk setiap produk dari gudang asal
    for (const item of items) {
        const productId = item.product_id;
        const requestedQty = parseInt(item.quantity, 10);

        if (!productId || isNaN(requestedQty) || requestedQty <= 0) {
            throw new Error(`Kuantitas transfer untuk produk '${productId || 'Unknown'}' harus bilangan bulat positif.`);
        }

        // Kunci baris master produk untuk mencegah race condition
        const [productRows] = await connection.query(
            `SELECT product_id, product_name, is_active FROM products WHERE product_id = ? FOR UPDATE`,
            [productId]
        );

        if (productRows.length === 0) {
            throw new Error(`Produk dengan SKU '${productId}' tidak ditemukan.`);
        }

        if (!productRows[0].is_active) {
            throw new Error(`Produk '${productRows[0].product_name}' (${productId}) berstatus non-aktif.`);
        }

        // Ambil batch aktif di gudang asal terurut FEFO dengan penguncian baris
        const [batchRows] = await connection.query(`
            SELECT 
                b.batch_id,
                b.batch_code,
                b.product_id,
                b.quantity,
                b.expired_date,
                b.received_date,
                b.location_id,
                l.location_code,
                l.zone_name,
                l.aisle,
                l.rack,
                l.tier,
                l.bin
            FROM inventory_batches b
            JOIN warehouse_locations l ON b.location_id = l.location_id
            WHERE b.product_id = ? 
              AND l.facility_id = ? 
              AND b.quantity > 0
            ORDER BY b.expired_date ASC, b.received_date ASC, b.batch_id ASC
            FOR UPDATE
        `, [productId, source_facility_id]);

        const totalAvailableInFacility = batchRows.reduce((sum, b) => sum + b.quantity, 0);
        if (totalAvailableInFacility < requestedQty) {
            throw new Error(`Stok produk '${productRows[0].product_name}' (${productId}) di gudang asal '${sourceFacility.facility_name}' tidak mencukupi (Tersedia: ${totalAvailableInFacility}, Diminta: ${requestedQty}).`);
        }

        // Alokasikan kuantitas sesuai aturan FEFO deterministik
        const allocationResult = allocateFefoBatches(batchRows, requestedQty);
        if (!allocationResult.fulfilled) {
            throw new Error(`Gagal memenuhi alokasi FEFO untuk produk '${productId}'.`);
        }

        // Potong kuantitas dari batch gudang asal
        for (const alloc of allocationResult.allocations) {
            await connection.query(
                `UPDATE inventory_batches SET quantity = quantity - ? WHERE batch_id = ?`,
                [alloc.deducted, alloc.batch_id]
            );

            transferItemsToInsert.push({
                product_id: productId,
                source_batch_id: alloc.batch_id,
                source_location_id: alloc.location_id,
                batch_code: alloc.batch_code,
                expired_date: alloc.expired_date,
                sent_quantity: alloc.deducted
            });
        }

        // Potong stok master (karena berstatus IN_TRANSIT tidak tersedia untuk outflow gudang manapun)
        await connection.query(
            `UPDATE products SET stock = stock - ? WHERE product_id = ?`,
            [requestedQty, productId]
        );

        totalSentQuantity += requestedQty;

        auditTransactionsToRecord.push({
            product_id: productId,
            quantity: requestedQty,
            allocations: allocationResult.allocations
        });
    }

    // 1. Simpan Header Transfer Order
    const [headerResult] = await connection.query(`
        INSERT INTO stock_transfers (
            transfer_number,
            source_facility_id,
            destination_facility_id,
            status,
            total_sent_quantity,
            total_received_quantity,
            sent_by,
            sent_at,
            notes
        ) VALUES (?, ?, ?, 'IN_TRANSIT', ?, 0, ?, NOW(), ?)
    `, [
        transferNumber,
        source_facility_id,
        destination_facility_id,
        totalSentQuantity,
        user_id || null,
        notes || `Transfer stok dari ${sourceFacility.facility_name} ke ${destFacility.facility_name}`
    ]);

    const transferId = headerResult.insertId;

    // 2. Simpan Rincian Transfer Items
    for (const item of transferItemsToInsert) {
        await connection.query(`
            INSERT INTO stock_transfer_items (
                transfer_id,
                product_id,
                source_batch_id,
                source_location_id,
                batch_code,
                expired_date,
                sent_quantity,
                received_quantity
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        `, [
            transferId,
            item.product_id,
            item.source_batch_id,
            item.source_location_id,
            item.batch_code,
            item.expired_date,
            item.sent_quantity
        ]);
    }

    // 3. Catat ke Audit Trail Log (TRANSFER_OUT)
    for (const trx of auditTransactionsToRecord) {
        const [trxResult] = await connection.query(`
            INSERT INTO stock_transactions (
                reference_no,
                product_id,
                user_id,
                transaction_type,
                quantity,
                notes,
                created_at
            ) VALUES (?, ?, ?, 'TRANSFER_OUT', ?, ?, NOW())
        `, [
            transferNumber,
            trx.product_id,
            user_id || null,
            trx.quantity,
            `Transfer keluar ke ${destFacility.facility_name} (${destFacility.facility_code})`
        ]);

        const transactionId = trxResult.insertId;

        // Catat alokasi batch spesifik ke stock_transaction_items
        for (const alloc of trx.allocations) {
            await connection.query(`
                INSERT INTO stock_transaction_items (transaction_id, batch_id, quantity)
                VALUES (?, ?, ?)
            `, [transactionId, alloc.batch_id, alloc.deducted]);
        }
    }

    return {
        transfer_id: transferId,
        transfer_number: transferNumber,
        source_facility: sourceFacility,
        destination_facility: destFacility,
        status: 'IN_TRANSIT',
        total_sent_quantity: totalSentQuantity,
        items: transferItemsToInsert
    };
}

/**
 * 2. Terima Pengiriman Transfer di Gudang Tujuan (Receive Transfer In)
 * Mendukung penerimaan penuh maupun sebagian (partial receipt), pencatatan selisih (discrepancy),
 * dan preservasi tanggal kedaluwarsa FEFO pada batch tujuan.
 */
async function receiveStockTransfer(connection, {
    transfer_id,
    received_items,
    user_id,
    notes
}) {
    if (!transfer_id) {
        throw new Error('ID transfer (transfer_id) wajib ditentukan.');
    }

    // Kunci baris transfer dengan FOR UPDATE untuk mencegah double-processing
    const [transfers] = await connection.query(
        `SELECT * FROM stock_transfers WHERE transfer_id = ? FOR UPDATE`,
        [transfer_id]
    );

    if (transfers.length === 0) {
        throw new Error(`Surat transfer dengan ID #${transfer_id} tidak ditemukan.`);
    }

    const transfer = transfers[0];

    // Validasi idempotensi: tidak boleh diproses dua kali
    if (transfer.status !== 'IN_TRANSIT') {
        throw new Error(`Transfer ${transfer.transfer_number} sudah diproses sebelumnya dengan status '${transfer.status}'.`);
    }

    // Ambil rincian transfer items
    const [transferItems] = await connection.query(
        `SELECT * FROM stock_transfer_items WHERE transfer_id = ? FOR UPDATE`,
        [transfer_id]
    );

    if (transferItems.length === 0) {
        throw new Error(`Tidak ada item terdaftar pada transfer #${transfer_id}.`);
    }

    const itemMap = new Map();
    transferItems.forEach(item => itemMap.set(item.item_id, item));

    // Periksa lokasi default gudang tujuan jika tidak ditentukan
    const [destLocations] = await connection.query(
        `SELECT location_id FROM warehouse_locations WHERE facility_id = ? AND is_active = TRUE LIMIT 1`,
        [transfer.destination_facility_id]
    );
    const defaultDestLocationId = destLocations.length > 0 ? destLocations[0].location_id : null;

    let totalReceivedSum = 0;
    const processedItems = [];

    for (const recvInput of received_items || []) {
        const item = itemMap.get(recvInput.item_id);
        if (!item) continue;

        const sentQty = item.sent_quantity;
        const recvQty = parseInt(recvInput.received_quantity, 10);

        if (isNaN(recvQty) || recvQty < 0) {
            throw new Error(`Kuantitas penerimaan untuk SKU '${item.product_id}' tidak valid.`);
        }

        if (recvQty > sentQty) {
            throw new Error(`Kuantitas penerimaan (${recvQty}) tidak boleh melebihi kuantitas yang dikirim (${sentQty}) untuk SKU '${item.product_id}'.`);
        }

        const discrepancy = sentQty - recvQty;
        const targetLocationId = recvInput.destination_location_id || defaultDestLocationId;
        const reason = recvInput.discrepancy_reason || (discrepancy > 0 ? 'Selisih kuantitas penerimaan di gudang tujuan' : null);

        let newBatchId = null;

        // Jika ada barang yang diterima (> 0), buat batch baru di gudang tujuan dengan expired date asli (FEFO preserved)
        if (recvQty > 0) {
            const expDateStr = typeof item.expired_date === 'string' 
                ? item.expired_date.split('T')[0] 
                : item.expired_date.toISOString().split('T')[0];

            const [batchInsert] = await connection.query(`
                INSERT INTO inventory_batches (
                    batch_code,
                    product_id,
                    location_id,
                    initial_quantity,
                    quantity,
                    expired_date,
                    received_date,
                    notes
                ) VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?)
            `, [
                item.batch_code || `BTC-TRF-${Date.now()}`,
                item.product_id,
                targetLocationId,
                recvQty,
                recvQty,
                expDateStr,
                `Penerimaan transfer ${transfer.transfer_number}`
            ]);

            newBatchId = batchInsert.insertId;

            // Tambahkan stok master produk
            await connection.query(
                `UPDATE products SET stock = stock + ? WHERE product_id = ?`,
                [recvQty, item.product_id]
            );

            // Catat transaksi mutasi masuk (TRANSFER_IN)
            const [trxInsert] = await connection.query(`
                INSERT INTO stock_transactions (
                    reference_no,
                    product_id,
                    user_id,
                    transaction_type,
                    quantity,
                    notes,
                    created_at
                ) VALUES (?, ?, ?, 'TRANSFER_IN', ?, ?, NOW())
            `, [
                transfer.transfer_number,
                item.product_id,
                user_id || null,
                recvQty,
                `Penerimaan transfer dari fasilitas asal (#${transfer.source_facility_id})`
            ]);

            // Link ke stock_transaction_items
            await connection.query(`
                INSERT INTO stock_transaction_items (transaction_id, batch_id, quantity)
                VALUES (?, ?, ?)
            `, [trxInsert.insertId, newBatchId, recvQty]);
        }

        // Jika ada selisih hilang/rusak (> 0), catat transaksi DISPOSAL untuk akuntabilitas
        if (discrepancy > 0) {
            await connection.query(`
                INSERT INTO stock_transactions (
                    reference_no,
                    product_id,
                    user_id,
                    transaction_type,
                    quantity,
                    notes,
                    created_at
                ) VALUES (?, ?, ?, 'DISPOSAL', ?, ?, NOW())
            `, [
                transfer.transfer_number,
                item.product_id,
                user_id || null,
                discrepancy,
                `Selisih transfer: ${reason}`
            ]);
        }

        // Perbarui item transfer
        await connection.query(`
            UPDATE stock_transfer_items SET
                received_quantity = ?,
                discrepancy_quantity = ?,
                discrepancy_reason = ?,
                destination_batch_id = ?,
                destination_location_id = ?
            WHERE item_id = ?
        `, [
            recvQty,
            discrepancy,
            reason,
            newBatchId,
            targetLocationId,
            item.item_id
        ]);

        totalReceivedSum += recvQty;
        processedItems.push({
            item_id: item.item_id,
            product_id: item.product_id,
            sent_quantity: sentQty,
            received_quantity: recvQty,
            discrepancy_quantity: discrepancy,
            destination_batch_id: newBatchId
        });
    }

    // Tentukan status akhir: RECEIVED jika 100% diterima, atau PARTIALLY_RECEIVED jika ada selisih
    const finalStatus = totalReceivedSum === transfer.total_sent_quantity 
        ? 'RECEIVED' 
        : 'PARTIALLY_RECEIVED';

    await connection.query(`
        UPDATE stock_transfers SET
            status = ?,
            total_received_quantity = ?,
            received_by = ?,
            received_at = NOW(),
            notes = COALESCE(?, notes)
        WHERE transfer_id = ?
    `, [
        finalStatus,
        totalReceivedSum,
        user_id || null,
        notes || null,
        transfer_id
    ]);

    return {
        transfer_id,
        transfer_number: transfer.transfer_number,
        status: finalStatus,
        total_sent_quantity: transfer.total_sent_quantity,
        total_received_quantity: totalReceivedSum,
        total_discrepancy: transfer.total_sent_quantity - totalReceivedSum,
        processed_items: processedItems
    };
}

/**
 * 3. Batalkan Pengiriman Transfer (Cancel Transfer)
 * Mengembalikan stok ke batch asal di gudang pengirim secara atomik
 */
async function cancelStockTransfer(connection, {
    transfer_id,
    cancel_reason,
    user_id
}) {
    if (!transfer_id) {
        throw new Error('ID transfer (transfer_id) wajib disertakan.');
    }

    // Kunci baris transfer dengan FOR UPDATE
    const [transfers] = await connection.query(
        `SELECT * FROM stock_transfers WHERE transfer_id = ? FOR UPDATE`,
        [transfer_id]
    );

    if (transfers.length === 0) {
        throw new Error(`Surat transfer dengan ID #${transfer_id} tidak ditemukan.`);
    }

    const transfer = transfers[0];

    // Pembatalan hanya diizinkan untuk transfer yang masih IN_TRANSIT atau DRAFT
    if (transfer.status !== 'IN_TRANSIT' && transfer.status !== 'DRAFT') {
        throw new Error(`Hanya transfer berstatus 'IN_TRANSIT' yang dapat dibatalkan. Status saat ini: '${transfer.status}'.`);
    }

    // Ambil seluruh rincian transfer items
    const [items] = await connection.query(
        `SELECT * FROM stock_transfer_items WHERE transfer_id = ? FOR UPDATE`,
        [transfer_id]
    );

    // Kembalikan stok ke masing-masing source_batch_id
    for (const item of items) {
        await connection.query(
            `UPDATE inventory_batches SET quantity = quantity + ? WHERE batch_id = ?`,
            [item.sent_quantity, item.source_batch_id]
        );

        // Kembalikan stok master produk
        await connection.query(
            `UPDATE products SET stock = stock + ? WHERE product_id = ?`,
            [item.sent_quantity, item.product_id]
        );

        // Catat transaksi kompensasi pembatalan di audit trail
        const [trxResult] = await connection.query(`
            INSERT INTO stock_transactions (
                reference_no,
                product_id,
                user_id,
                transaction_type,
                quantity,
                notes,
                created_at
            ) VALUES (?, ?, ?, 'IN', ?, ?, NOW())
        `, [
            transfer.transfer_number,
            item.product_id,
            user_id || null,
            item.sent_quantity,
            `Kompensasi pembatalan transfer: ${cancel_reason || 'Dibatalkan oleh operator'}`
        ]);

        await connection.query(`
            INSERT INTO stock_transaction_items (transaction_id, batch_id, quantity)
            VALUES (?, ?, ?)
        `, [trxResult.insertId, item.source_batch_id, item.sent_quantity]);
    }

    // Perbarui status transfer menjadi CANCELLED
    await connection.query(`
        UPDATE stock_transfers SET
            status = 'CANCELLED',
            cancel_reason = ?,
            updated_at = NOW()
        WHERE transfer_id = ?
    `, [
        cancel_reason || 'Pembatalan sebelum penerimaan di gudang tujuan',
        transfer_id
    ]);

    return {
        transfer_id,
        transfer_number: transfer.transfer_number,
        status: 'CANCELLED',
        cancel_reason: cancel_reason || 'Dibatalkan oleh operator'
    };
}

module.exports = {
    generateTransferNumber,
    initiateStockTransfer,
    receiveStockTransfer,
    cancelStockTransfer
};
