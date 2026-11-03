const db = require('../config/database');
const inventoryService = require('../services/inventoryService');

// 1. Penerimaan Barang Masuk (Stock Inbound)
exports.addStockBatch = async (req, res, next) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const payload = req.validatedBody || req.body;
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
