const db = require('../config/database');
const inventoryService = require('../services/inventoryService');
const { parseCsvToObjects } = require('../utils/csvParser');

// 1. Penerimaan Barang Masuk (Stock Inbound)
exports.addStockBatch = async (req, res, next) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const payload = req.validatedBody || req.body;
        if (req.user) {
            payload.user_id = req.user.user_id;
        }
        const result = await inventoryService.processStockIn(connection, payload);

        await connection.commit();

        res.status(201).json({
            status: 'Success',
            message: `Batch barang untuk '${result.product_name}' (${result.quantity} unit) berhasil diterima!`,
            data: result
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error addStockBatch:', error.message);
        res.status(400).json({ status: 'Error', message: error.message });
    } finally {
        if (connection) connection.release();
    }
};

// 2. Pengeluaran Barang Otomatis FEFO (Stock Outflow)
exports.reduceStockFifo = async (req, res, next) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const payload = req.validatedBody || req.body;
        if (req.user) {
            payload.user_id = req.user.user_id;
        }
        const result = await inventoryService.processStockOutFefo(connection, payload);

        await connection.commit();

        res.json({
            status: 'Success',
            message: `Pengeluaran ${result.total_deducted} unit '${result.product_name}' berhasil diproses via alokasi FEFO!`,
            data: result
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error reduceStockFifo:', error.message);
        res.status(400).json({ status: 'Error', message: error.message });
    } finally {
        if (connection) connection.release();
    }
};

// 3. Modul Pembuangan Barang Afkir / Kadaluwarsa (Stock Disposal)
exports.adjustStockDisposal = async (req, res, next) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const payload = req.validatedBody || req.body;
        if (req.user) {
            payload.user_id = req.user.user_id;
        }
        const result = await inventoryService.processStockDisposal(connection, payload);

        await connection.commit();

        res.json({
            status: 'Success',
            message: `Pembuangan afkir ${result.quantity} unit '${result.product_name}' berhasil dieksekusi dan dicatat!`,
            data: result
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error adjustStockDisposal:', error.message);
        res.status(400).json({ status: 'Error', message: error.message });
    } finally {
        if (connection) connection.release();
    }
};

// 4. Modul Rekonsiliasi Stok Opname Fisik (Stock Opname)
exports.recordStockOpname = async (req, res, next) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const payload = req.validatedBody || req.body;
        if (req.user) {
            payload.user_id = req.user.user_id;
        }
        const result = await inventoryService.processStockOpname(connection, payload);

        await connection.commit();

        const diffText = result.difference > 0 ? `Surplus (+${result.difference})` : result.difference < 0 ? `Defisit (${result.difference})` : 'Sesuai (0)';
        res.json({
            status: 'Success',
            message: `Stock Opname untuk '${result.product_name}' selesai. Selisih: ${diffText}.`,
            data: result
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error recordStockOpname:', error.message);
        res.status(400).json({ status: 'Error', message: error.message });
    } finally {
        if (connection) connection.release();
    }
};

// 5. Ambil Riwayat Audit Log Transaksi Lengkap
exports.getTransactionLogs = async (req, res) => {
    try {
        const { type, product_id, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT 
                t.transaction_id,
                t.reference_no,
                t.product_id,
                p.product_name,
                p.unit,
                u.full_name AS operator,
                u.username AS operator_username,
                t.transaction_type,
                t.quantity,
                t.notes,
                t.created_at
            FROM stock_transactions t
            JOIN products p ON t.product_id = p.product_id
            LEFT JOIN users u ON t.user_id = u.user_id
            WHERE 1=1
        `;
        const params = [];

        if (type && ['IN', 'OUT', 'DISPOSAL', 'ADJUSTMENT'].includes(type.toUpperCase())) {
            query += ` AND t.transaction_type = ?`;
            params.push(type.toUpperCase());
        }

        if (product_id) {
            query += ` AND t.product_id = ?`;
            params.push(product_id);
        }

        query += ` ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit, 10) || 50, parseInt(offset, 10) || 0);

        const [logs] = await db.query(query, params);
        res.json({ status: 'Success', count: logs.length, data: logs });
    } catch (error) {
        console.error('❌ Error getTransactionLogs:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 6. Ambil Riwayat Stock Opname
exports.getOpnameLogs = async (req, res) => {
    try {
        const query = `
            SELECT 
                o.opname_id,
                o.opname_number,
                o.product_id,
                p.product_name,
                p.unit,
                o.system_stock,
                o.physical_stock,
                o.difference,
                o.reason,
                o.status,
                u.full_name AS operator,
                o.created_at
            FROM stock_opname o
            JOIN products p ON o.product_id = p.product_id
            LEFT JOIN users u ON o.performed_by = u.user_id
            ORDER BY o.created_at DESC;
        `;
        const [rows] = await db.query(query);
        res.json({ status: 'Success', data: rows });
    } catch (error) {
        console.error('❌ Error getOpnameLogs:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 7. Impor Massal Penerimaan Barang (Bulk Inbound Manifest CSV)
exports.importStockInboundCsv = async (req, res) => {
    let connection;
    try {
        const csvData = req.body.csv_data || (typeof req.body === 'string' ? req.body : '');
        if (!csvData || typeof csvData !== 'string' || csvData.trim().length === 0) {
            return res.status(400).json({
                status: 'Error',
                message: 'Data teks CSV tidak boleh kosong.'
            });
        }

        const rows = parseCsvToObjects(csvData);
        if (rows.length === 0) {
            return res.status(400).json({
                status: 'Error',
                message: 'File CSV tidak berisi baris data manifest yang valid.'
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // 1. Ambil pemetaan lokasi dan pemasok untuk lookup kode cepat
        const [locRows] = await connection.query(`SELECT location_id, location_code FROM warehouse_locations`);
        const locationMap = new Map();
        if (locRows) locRows.forEach(l => locationMap.set(l.location_code.toUpperCase(), l.location_id));

        const [supRows] = await connection.query(`SELECT supplier_id, supplier_code FROM suppliers`);
        const supplierMap = new Map();
        if (supRows) supRows.forEach(s => supplierMap.set(s.supplier_code.toUpperCase(), s.supplier_id));

        const processed = [];
        const errors = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2;

            const rawProductId = row.product_id || row.sku || row.kode_produk;
            const rawQty = row.quantity || row.qty || row.jumlah;
            const rawExpDate = row.expired_date || row.tgl_kedaluwarsa || row.expiry;
            const rawBatchCode = row.batch_code || row.kode_batch || row.batch;
            const rawLocCode = row.location_code || row.lokasi_rak || row.rak;
            const rawSupCode = row.supplier_code || row.kode_pemasok || row.pemasok;
            const rawNotes = row.notes || row.catatan || 'Inbound via Manifest CSV';

            if (!rawProductId || String(rawProductId).trim().length < 2) {
                errors.push({ row: rowNum, error: 'SKU / ID Produk wajib diisi.' });
                continue;
            }

            const qty = parseInt(rawQty, 10);
            if (!Number.isInteger(qty) || qty <= 0) {
                errors.push({ row: rowNum, sku: rawProductId, error: 'Kuantitas barang masuk harus angka bulat positif (> 0).' });
                continue;
            }

            let expiredDate = String(rawExpDate || '').trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(expiredDate)) {
                // Fallback default expired 1 tahun jika tidak ada
                const d = new Date();
                d.setFullYear(d.getFullYear() + 1);
                expiredDate = d.toISOString().split('T')[0];
            }

            const productId = String(rawProductId).trim().toUpperCase();
            const locationId = rawLocCode ? locationMap.get(String(rawLocCode).trim().toUpperCase()) || null : null;
            const supplierId = rawSupCode ? supplierMap.get(String(rawSupCode).trim().toUpperCase()) || null : null;

            try {
                const stockInResult = await inventoryService.processStockIn(connection, {
                    product_id: productId,
                    quantity: qty,
                    expired_date: expiredDate,
                    supplier_id: supplierId,
                    location_id: locationId,
                    batch_code: rawBatchCode ? String(rawBatchCode).trim() : null,
                    notes: String(rawNotes).trim(),
                    user_id: req.user ? req.user.user_id : (req.body.user_id || 1)
                });

                processed.push({
                    reference_no: stockInResult.reference_no,
                    product_id: productId,
                    product_name: stockInResult.product_name,
                    quantity: qty,
                    batch_code: stockInResult.batch_code,
                    location_code: rawLocCode || 'Penampungan Default'
                });
            } catch (itemErr) {
                errors.push({ row: rowNum, sku: productId, error: itemErr.message });
            }
        }

        if (processed.length === 0 && errors.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                status: 'Error',
                message: 'Seluruh baris manifest gagal diproses.',
                errors
            });
        }

        await connection.commit();

        res.json({
            status: 'Success',
            message: `Impor manifest inbound selesai: ${processed.length} batch berhasil diterima dan dicatat di rak.${errors.length > 0 ? ` (${errors.length} baris dilewati)` : ''}`,
            data: {
                total_rows: rows.length,
                processed_count: processed.length,
                processed,
                errors
            }
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error importStockInboundCsv:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    } finally {
        if (connection) connection.release();
    }
};
