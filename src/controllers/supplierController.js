const db = require('../config/database');

// 1. Ambil Semua Pemasok Aktif
exports.getAllSuppliers = async (req, res) => {
    try {
        const [suppliers] = await db.query(
            `SELECT supplier_id, supplier_code, supplier_name, contact_person, phone, email, address, created_at 
             FROM suppliers 
             WHERE is_active = 1 
             ORDER BY supplier_name ASC`
        );
        res.json({ status: 'Success', count: suppliers.length, data: suppliers });
    } catch (error) {
        console.error('❌ Error getAllSuppliers:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 2. Tambah Pemasok Baru
exports.createSupplier = async (req, res) => {
    try {
        const { supplier_code, supplier_name, contact_person, phone, email, address } = req.body;

        if (!supplier_code || !supplier_name) {
            return res.status(400).json({
                status: 'Error',
                message: 'Kode pemasok dan nama pemasok wajib diisi.'
            });
        }

        const [existing] = await db.query('SELECT supplier_id FROM suppliers WHERE supplier_code = ?', [supplier_code]);
        if (existing && existing.length > 0) {
            return res.status(400).json({
                status: 'Error',
                message: `Pemasok dengan kode '${supplier_code}' sudah terdaftar.`
            });
        }

        const [result] = await db.query(
            `INSERT INTO suppliers (supplier_code, supplier_name, contact_person, phone, email, address)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [supplier_code.trim().toUpperCase(), supplier_name.trim(), contact_person || null, phone || null, email || null, address || null]
        );

        res.status(201).json({
            status: 'Success',
            message: `Pemasok '${supplier_name}' berhasil didaftarkan!`,
            data: { supplier_id: result.insertId, supplier_code, supplier_name }
        });
    } catch (error) {
        console.error('❌ Error createSupplier:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};
