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
        console.error('❌ Error getAllProducts:', error.message);
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
        console.error('❌ Error getFifoBatches:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 3. Tambah Produk / SKU Baru ke Master Data
exports.createProduct = async (req, res) => {
    try {
        const { product_id, product_name, category, min_stock, unit } = req.body;

        if (!product_id || !product_name || !category || !unit) {
            return res.status(400).json({ 
                status: 'Error', 
                message: 'ID Produk, Nama, Kategori, dan Satuan wajib diisi!' 
            });
        }

        // Cek apakah ID produk sudah terdaftar
        const [existing] = await db.query('SELECT product_id FROM products WHERE product_id = ?', [product_id]);
        if (existing.length > 0) {
            return res.status(400).json({ 
                status: 'Error', 
                message: `ID Produk '${product_id}' sudah terdaftar di sistem.` 
            });
        }

        await db.query(
            `INSERT INTO products (product_id, product_name, category, min_stock, unit) 
             VALUES (?, ?, ?, ?, ?)`,
            [product_id, product_name, category, min_stock || 10, unit]
        );

        res.json({ 
            status: 'Success', 
            message: `Produk '${product_name}' (${product_id}) berhasil ditambahkan!` 
        });

    } catch (error) {
        console.error('❌ Error createProduct:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};