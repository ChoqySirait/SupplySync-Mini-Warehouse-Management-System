const db = require('../config/database');

// Logika Pengeluaran Barang Otomatis Memotong Batch Expired Terdekat (Auto-FIFO Engine)
exports.reduceStockFifo = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { product_id, quantity, user_id, notes } = req.body;
        let qtyToReduce = parseInt(quantity);

        if (!product_id || !qtyToReduce || qtyToReduce <= 0) {
            return res.status(400).json({ status: 'Error', message: 'Data produk dan jumlah barang tidak valid.' });
        }

        await connection.beginTransaction();

        // 1. Ambil Batch yang masih ada stok, diurutkan dari expired paling dekat (FIFO)
        const [batches] = await connection.query(
            `SELECT * FROM inventory_batches 
             WHERE product_id = ? AND quantity > 0 
             ORDER BY expired_date ASC 
             FOR UPDATE`,
            [product_id]
        );

        const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0);
        if (totalAvailable < qtyToReduce) {
            await connection.rollback();
            return res.status(400).json({ 
                status: 'Error', 
                message: `Stok tidak mencukupi. Stok tersedia: ${totalAvailable}` 
            });
        }

        // 2. Potong stok batch demi batch berdasarkan urutan FIFO
        for (let batch of batches) {
            if (qtyToReduce <= 0) break;

            if (batch.quantity <= qtyToReduce) {
                qtyToReduce -= batch.quantity;
                await connection.query(
                    `UPDATE inventory_batches SET quantity = 0 WHERE batch_id = ?`,
                    [batch.batch_id]
                );
            } else {
                await connection.query(
                    `UPDATE inventory_batches SET quantity = quantity - ? WHERE batch_id = ?`,
                    [qtyToReduce, batch.batch_id]
                );
                qtyToReduce = 0;
            }
        }

        // 3. Catat di Audit Log Transaksi
        await connection.query(
            `INSERT INTO stock_transactions (product_id, user_id, transaction_type, quantity, notes) 
             VALUES (?, ?, 'OUT', ?, ?)`,
            [product_id, user_id || 1, quantity, notes || 'Pengeluaran barang FIFO']
        );

        await connection.commit();
        res.json({ status: 'Success', message: 'Pengeluaran stok barang berhasil diproses!' });

    } catch (error) {
        await connection.rollback();
        console.error('❌ Error reduceStockFifo:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    } finally {
        connection.release();
    }
};

// Ambil Riwayat Audit Log Transaksi
exports.getTransactionLogs = async (req, res) => {
    try {
        const query = `
            SELECT 
                t.transaction_id,
                p.product_name,
                u.full_name AS operator,
                t.transaction_type,
                t.quantity,
                t.notes,
                t.created_at
            FROM stock_transactions t
            JOIN products p ON t.product_id = p.product_id
            LEFT JOIN users u ON t.user_id = u.user_id
            ORDER BY t.created_at DESC;
        `;
        const [logs] = await db.query(query);
        res.json({ status: 'Success', data: logs });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
};