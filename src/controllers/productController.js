const db = require('../config/database');

// 1. Ambil Semua Produk + Total Stok Gabungan & Status Ambang Batas
exports.getAllProducts = async (req, res) => {
    try {
        const { search, category, status } = req.query;

        let query = `
            SELECT 
                p.product_id,
                p.product_name,
                p.category,
                p.unit,
                p.min_stock,
                p.description,
                p.is_active,
                p.created_at,
                COALESCE(SUM(CASE WHEN b.quantity > 0 THEN b.quantity ELSE 0 END), 0) AS total_stock,
                COUNT(CASE WHEN b.quantity > 0 THEN b.batch_id ELSE NULL END) AS active_batches,
                MIN(CASE WHEN b.quantity > 0 THEN b.expired_date ELSE NULL END) AS nearest_expiration,
                CASE 
                    WHEN COALESCE(SUM(CASE WHEN b.quantity > 0 THEN b.quantity ELSE 0 END), 0) = 0 THEN 'Out of Stock'
                    WHEN COALESCE(SUM(CASE WHEN b.quantity > 0 THEN b.quantity ELSE 0 END), 0) <= p.min_stock THEN 'Low Stock'
                    ELSE 'Safe'
                END AS stock_status
            FROM products p
            LEFT JOIN inventory_batches b ON p.product_id = b.product_id
            WHERE p.is_active = 1
        `;
        const params = [];

        if (search) {
            query += ` AND (p.product_id LIKE ? OR p.product_name LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        if (category) {
            query += ` AND p.category = ?`;
            params.push(category);
        }

        query += `
            GROUP BY p.product_id, p.product_name, p.category, p.unit, p.min_stock, p.description, p.is_active, p.created_at
        `;

        if (status) {
            if (status === 'Safe') query += ` HAVING total_stock > p.min_stock`;
            else if (status === 'Low Stock') query += ` HAVING total_stock <= p.min_stock AND total_stock > 0`;
            else if (status === 'Out of Stock') query += ` HAVING total_stock = 0`;
        }

        query += ` ORDER BY p.created_at DESC;`;

        const [products] = await db.query(query, params);
        res.json({ status: 'Success', count: products.length, data: products });
    } catch (error) {
        console.error('❌ Error getAllProducts:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 2. Ambil Batch Stok Berdasarkan Urutan FEFO (Expired Terdekat)
exports.getFifoBatches = async (req, res) => {
    try {
        const query = `
            SELECT 
                b.batch_id,
                b.batch_code,
                b.product_id,
                p.product_name,
                p.unit,
                b.quantity,
                b.initial_quantity,
                b.expired_date,
                b.received_date,
                COALESCE(l.location_code, 'A-01-01') AS location_code,
                COALESCE(l.zone_name, 'Area Umum') AS zone_name,
                DATEDIFF(b.expired_date, CURDATE()) AS days_until_expiration,
                CASE 
                    WHEN b.expired_date < CURDATE() THEN 'Expired'
                    WHEN DATEDIFF(b.expired_date, CURDATE()) <= 30 THEN 'Warning (<= 30 Hari)'
                    ELSE 'Fresh'
                END AS freshness_status
            FROM inventory_batches b
            JOIN products p ON b.product_id = p.product_id
            LEFT JOIN warehouse_locations l ON b.location_id = l.location_id
            WHERE b.quantity > 0
            ORDER BY b.expired_date ASC, b.received_date ASC, b.batch_id ASC;
        `;

        const [batches] = await db.query(query);
        res.json({ status: 'Success', count: batches.length, data: batches });
    } catch (error) {
        console.error('❌ Error getFifoBatches:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 3. Ambil Rincian Batch per SKU Produk Lengkap dengan Lokasi Rak Fisik
exports.getProductBatches = async (req, res) => {
    try {
        const { id } = req.params;
        const query = `
            SELECT 
                b.batch_id,
                b.batch_code,
                b.product_id,
                s.supplier_name,
                COALESCE(l.location_code, 'A-01-01') AS location_code,
                COALESCE(l.zone_name, 'Zona Utama') AS zone_name,
                COALESCE(l.aisle, 'Lorong 1') AS aisle,
                COALESCE(l.rack, 'Rak 1') AS rack,
                COALESCE(l.tier, 'Tingkat 1') AS tier,
                COALESCE(l.bin, 'Bin 1') AS bin,
                b.initial_quantity,
                b.quantity,
                b.expired_date,
                b.received_date,
                b.notes,
                DATEDIFF(b.expired_date, CURDATE()) AS days_until_expiration
            FROM inventory_batches b
            LEFT JOIN suppliers s ON b.supplier_id = s.supplier_id
            LEFT JOIN warehouse_locations l ON b.location_id = l.location_id
            WHERE b.product_id = ? AND b.quantity > 0
            ORDER BY b.expired_date ASC, b.received_date ASC;
        `;

        const [batches] = await db.query(query, [id]);
        res.json({ status: 'Success', count: batches.length, data: batches });
    } catch (error) {
        console.error('❌ Error getProductBatches:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 4. Tambah SKU / Master Produk Baru
exports.createProduct = async (req, res) => {
    try {
        const payload = req.validatedBody || req.body;
        const { product_id, product_name, category, unit, min_stock, description } = payload;

        // Cek Duplikasi SKU
        const [existing] = await db.query('SELECT product_id FROM products WHERE product_id = ?', [product_id]);
        if (existing && existing.length > 0) {
            return res.status(400).json({ 
                status: 'Error', 
                message: `SKU / ID Produk '${product_id}' sudah terdaftar di sistem WMS.` 
            });
        }

        // Simpan Ke MySQL
        await db.query(
            `INSERT INTO products (product_id, product_name, category, min_stock, unit, description) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [product_id, product_name, category, min_stock || 10, unit, description || null]
        );

        res.status(201).json({ 
            status: 'Success', 
            message: `Produk '${product_name}' (${product_id}) berhasil didaftarkan ke katalog master gudang!`,
            data: { product_id, product_name, category, unit, min_stock }
        });

    } catch (error) {
        console.error('❌ Error createProduct:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 5. Update Master Produk
exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { product_name, category, unit, min_stock, description } = req.body;

        const [existing] = await db.query('SELECT product_id FROM products WHERE product_id = ?', [id]);
        if (!existing || existing.length === 0) {
            return res.status(404).json({ status: 'Error', message: `Produk '${id}' tidak ditemukan.` });
        }

        await db.query(
            `UPDATE products SET 
                product_name = COALESCE(?, product_name),
                category = COALESCE(?, category),
                unit = COALESCE(?, unit),
                min_stock = COALESCE(?, min_stock),
                description = COALESCE(?, description)
             WHERE product_id = ?`,
            [product_name || null, category || null, unit || null, min_stock !== undefined ? parseInt(min_stock, 10) : null, description || null, id]
        );

        res.json({ status: 'Success', message: `Data master produk '${id}' berhasil diperbarui!` });
    } catch (error) {
        console.error('❌ Error updateProduct:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 6. Hapus Produk (Soft-delete aman jika tidak ada stok aktif)
exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        const [[stockRow]] = await db.query(
            `SELECT COALESCE(SUM(quantity), 0) AS total_stock FROM inventory_batches WHERE product_id = ? AND quantity > 0`,
            [id]
        );

        if (stockRow && stockRow.total_stock > 0) {
            return res.status(400).json({
                status: 'Error',
                message: `Tidak dapat menghapus produk '${id}' karena masih memiliki stok aktif sebanyak ${stockRow.total_stock} unit. Lakukan pengeluaran atau disposal terlebih dahulu.`
            });
        }

        await db.query(`UPDATE products SET is_active = 0 WHERE product_id = ?`, [id]);
        res.json({ status: 'Success', message: `Produk '${id}' berhasil dinonaktifkan.` });
    } catch (error) {
        console.error('❌ Error deleteProduct:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};
