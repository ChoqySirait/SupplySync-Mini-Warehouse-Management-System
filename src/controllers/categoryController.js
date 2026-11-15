const db = require('../config/database');

/**
 * SupplySync WMS - Master Category Management Controller
 */

// 1. Ambil Semua Kategori Produk
exports.getAllCategories = async (req, res) => {
    try {
        const { search } = req.query;

        let query = `
            SELECT c.category_id, c.category_name, c.description, c.created_at,
                   COUNT(p.product_id) AS total_products,
                   COALESCE(SUM(CASE WHEN b.quantity > 0 THEN b.quantity ELSE 0 END), 0) AS total_stock_quantity
            FROM categories c
            LEFT JOIN products p ON (c.category_id = p.category_id OR TRIM(c.category_name) = TRIM(p.category)) AND p.is_active = 1
            LEFT JOIN inventory_batches b ON p.product_id = b.product_id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND c.category_name LIKE ?`;
            params.push(`%${search}%`);
        }

        query += ` GROUP BY c.category_id, c.category_name, c.description, c.created_at ORDER BY c.category_name ASC;`;

        const [categories] = await db.query(query, params);
        res.json({ status: 'Success', count: categories.length, data: categories });
    } catch (error) {
        console.error('❌ Error getAllCategories:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 2. Ambil Rincian Kategori Berdasarkan ID
exports.getCategoryById = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            `SELECT c.*, COUNT(p.product_id) AS total_products
             FROM categories c
             LEFT JOIN products p ON (c.category_id = p.category_id OR TRIM(c.category_name) = TRIM(p.category)) AND p.is_active = 1
             WHERE c.category_id = ?
             GROUP BY c.category_id`,
            [id]
        );

        if (!rows || rows.length === 0) {
            return res.status(404).json({ status: 'Error', message: `Kategori ID ${id} tidak ditemukan.` });
        }

        const [products] = await db.query(
            `SELECT product_id, product_name, unit, min_stock, cost_price, is_active
             FROM products
             WHERE category_id = ? OR category = ?
             ORDER BY product_name ASC`,
            [id, rows[0].category_name]
        );

        res.json({
            status: 'Success',
            data: {
                ...rows[0],
                products: products || []
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 3. Tambah Kategori Baru
exports.createCategory = async (req, res) => {
    try {
        const { category_name, description } = req.body;

        if (!category_name || category_name.trim().length < 2) {
            return res.status(400).json({
                status: 'Error',
                message: 'Nama kategori wajib diisi minimal 2 karakter.'
            });
        }

        const cleanName = category_name.trim();

        const [existing] = await db.query('SELECT category_id FROM categories WHERE LOWER(category_name) = ?', [cleanName.toLowerCase()]);
        if (existing && existing.length > 0) {
            return res.status(409).json({
                status: 'Error',
                message: `Kategori '${cleanName}' sudah terdaftar.`
            });
        }

        const [result] = await db.query(
            `INSERT INTO categories (category_name, description) VALUES (?, ?)`,
            [cleanName, description || null]
        );

        res.status(201).json({
            status: 'Success',
            message: `Kategori '${cleanName}' berhasil ditambahkan!`,
            data: { category_id: result.insertId, category_name: cleanName, description }
        });
    } catch (error) {
        console.error('❌ Error createCategory:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 4. Update Kategori
exports.updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { category_name, description } = req.body;

        const [existing] = await db.query('SELECT category_id, category_name FROM categories WHERE category_id = ?', [id]);
        if (!existing || existing.length === 0) {
            return res.status(404).json({ status: 'Error', message: `Kategori ID ${id} tidak ditemukan.` });
        }

        const cleanName = category_name ? category_name.trim() : existing[0].category_name;

        await db.query(
            `UPDATE categories SET category_name = ?, description = ? WHERE category_id = ?`,
            [cleanName, description !== undefined ? description : null, id]
        );

        // Sinkronisasi teks kategori pada produk yang tertaut
        await db.query(
            `UPDATE products SET category = ? WHERE category_id = ?`,
            [cleanName, id]
        );

        res.json({
            status: 'Success',
            message: `Kategori '${cleanName}' berhasil diperbarui!`
        });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 5. Hapus Kategori
exports.deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;

        const [existing] = await db.query('SELECT category_id, category_name FROM categories WHERE category_id = ?', [id]);
        if (!existing || existing.length === 0) {
            return res.status(404).json({ status: 'Error', message: `Kategori ID ${id} tidak ditemukan.` });
        }

        // Cek apakah masih ada produk yang menautkan kategori ini
        const [linkedProducts] = await db.query(
            'SELECT COUNT(*) AS total FROM products WHERE category_id = ? OR category = ?',
            [id, existing[0].category_name]
        );

        if (linkedProducts[0].total > 0) {
            return res.status(400).json({
                status: 'Error',
                message: `Kategori '${existing[0].category_name}' tidak dapat dihapus karena masih digunakan oleh ${linkedProducts[0].total} produk.`
            });
        }

        await db.query('DELETE FROM categories WHERE category_id = ?', [id]);

        res.json({
            status: 'Success',
            message: `Kategori '${existing[0].category_name}' berhasil dihapus.`
        });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
};
