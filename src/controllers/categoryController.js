const db = require('../config/database');

// 1. Ambil Semua Kategori Produk
exports.getAllCategories = async (req, res) => {
    try {
        const [categories] = await db.query(
            `SELECT c.category_id, c.category_name, c.description, COUNT(p.product_id) AS total_products
             FROM categories c
             LEFT JOIN products p ON c.category_name = p.category AND p.is_active = 1
             GROUP BY c.category_id, c.category_name, c.description
             ORDER BY c.category_name ASC`
        );
        res.json({ status: 'Success', count: categories.length, data: categories });
    } catch (error) {
        console.error('❌ Error getAllCategories:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 2. Tambah Kategori Baru
exports.createCategory = async (req, res) => {
    try {
        const { category_name, description } = req.body;

        if (!category_name || category_name.trim().length < 2) {
            return res.status(400).json({
                status: 'Error',
                message: 'Nama kategori wajib diisi minimal 2 karakter.'
            });
        }

        const [existing] = await db.query('SELECT category_id FROM categories WHERE category_name = ?', [category_name.trim()]);
        if (existing && existing.length > 0) {
            return res.status(400).json({
                status: 'Error',
                message: `Kategori '${category_name}' sudah terdaftar.`
            });
        }

        const [result] = await db.query(
            `INSERT INTO categories (category_name, description) VALUES (?, ?)`,
            [category_name.trim(), description || null]
        );

        res.status(201).json({
            status: 'Success',
            message: `Kategori '${category_name}' berhasil ditambahkan!`,
            data: { category_id: result.insertId, category_name }
        });
    } catch (error) {
        console.error('❌ Error createCategory:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};
