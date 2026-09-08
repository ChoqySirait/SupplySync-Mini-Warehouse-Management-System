const db = require('../config/database');

// 1. Ambil Semua Produk + Total Stok Gabungan
exports.getAllProducts = async (req, res) => {
    try {
        const query = `
            SELECT 
                p.product_id,
                p.product_name,
                p.category,
                p.unit,
                p.min_stock,
                COALESCE(SUM(b.quantity), 0) AS total_stock,
                CASE 
                    WHEN COALESCE(SUM(b.quantity), 0) = 0 THEN 'Out of Stock'
                    WHEN COALESCE(SUM(b.quantity), 0) <= p.min_stock THEN 'Low Stock'
                    ELSE 'Safe'
                END AS stock_status
            FROM products p
            LEFT JOIN inventory_batches b ON p.product_id = b.product_id
            GROUP BY p.product_id, p.product_name, p.category, p.unit, p.min_stock;
        `;
        
        const [products] = await db.query(query);
        res.json({
            status: 'Success',
            data: products
        });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 2. Ambil Batch Stok Khusus Urutan FIFO (Expired Paling Dekat)
exports.getFifoBatches = async (req, res) => {
    try {
        const query = `
            SELECT 
                b.batch_id,
                p.product_name,
                b.quantity,
                b.expired_date,
                DATEDIFF(b.expired_date, CURDATE()) AS days_until_expiration
            FROM inventory_batches b
            JOIN products p ON b.product_id = p.product_id
            WHERE b.quantity > 0
            ORDER BY b.expired_date ASC;
        `;

        const [batches] = await db.query(query);
        res.json({
            status: 'Success',
            data: batches
        });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
};