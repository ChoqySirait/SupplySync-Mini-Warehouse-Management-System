const db = require('../config/database');

/**
 * SupplySync WMS - Supplier Management Controller
 */

// 1. Ambil Semua Pemasok
exports.getAllSuppliers = async (req, res) => {
    try {
        const { search, is_active } = req.query;

        let query = `
            SELECT s.supplier_id, s.supplier_code, s.supplier_name, s.contact_person, 
                   s.phone, s.email, s.address, s.lead_time_days, s.is_active, s.created_at,
                   COUNT(DISTINCT b.batch_id) AS total_batches_supplied,
                   COALESCE(SUM(b.quantity), 0) AS total_stock_on_hand
            FROM suppliers s
            LEFT JOIN inventory_batches b ON s.supplier_id = b.supplier_id AND b.quantity > 0
            WHERE 1=1
        `;
        const params = [];

        if (is_active !== undefined && is_active !== '') {
            query += ` AND s.is_active = ?`;
            params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
        } else {
            query += ` AND s.is_active = 1`;
        }

        if (search) {
            query += ` AND (s.supplier_code LIKE ? OR s.supplier_name LIKE ? OR s.contact_person LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ` GROUP BY s.supplier_id ORDER BY s.supplier_name ASC;`;

        const [suppliers] = await db.query(query, params);
        res.json({ status: 'Success', count: suppliers.length, data: suppliers });
    } catch (error) {
        console.error('❌ Error getAllSuppliers:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 2. Ambil Rincian Pemasok Berdasarkan ID
exports.getSupplierById = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            `SELECT s.*, 
                    COUNT(DISTINCT po.po_id) AS total_po,
                    COUNT(DISTINCT b.batch_id) AS total_batches
             FROM suppliers s
             LEFT JOIN purchase_orders po ON s.supplier_id = po.supplier_id
             LEFT JOIN inventory_batches b ON s.supplier_id = b.supplier_id
             WHERE s.supplier_id = ?
             GROUP BY s.supplier_id`,
            [id]
        );

        if (!rows || rows.length === 0) {
            return res.status(404).json({ status: 'Error', message: `Pemasok dengan ID '${id}' tidak ditemukan.` });
        }

        // Ambil riwayat pengadaan terbaru dari pemasok ini
        const [recentOrders] = await db.query(
            `SELECT po_id, po_number, status, total_amount, order_date, expected_delivery_date
             FROM purchase_orders
             WHERE supplier_id = ?
             ORDER BY order_date DESC
             LIMIT 5`,
            [id]
        );

        res.json({
            status: 'Success',
            data: {
                ...rows[0],
                recent_orders: recentOrders || []
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 3. Tambah Pemasok Baru
exports.createSupplier = async (req, res) => {
    try {
        const { supplier_code, supplier_name, contact_person, phone, email, address, lead_time_days } = req.body;

        if (!supplier_code || !supplier_name) {
            return res.status(400).json({
                status: 'Error',
                message: 'Kode pemasok dan nama pemasok wajib diisi.'
            });
        }

        const cleanCode = supplier_code.trim().toUpperCase();

        const [existing] = await db.query('SELECT supplier_id FROM suppliers WHERE supplier_code = ?', [cleanCode]);
        if (existing && existing.length > 0) {
            return res.status(409).json({
                status: 'Error',
                message: `Pemasok dengan kode '${cleanCode}' sudah terdaftar.`
            });
        }

        const parsedLeadTime = lead_time_days !== undefined ? parseInt(lead_time_days, 10) : 7;

        const [result] = await db.query(
            `INSERT INTO suppliers (supplier_code, supplier_name, contact_person, phone, email, address, lead_time_days)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [cleanCode, supplier_name.trim(), contact_person || null, phone || null, email || null, address || null, parsedLeadTime >= 1 ? parsedLeadTime : 7]
        );

        res.status(201).json({
            status: 'Success',
            message: `Pemasok '${supplier_name}' (${cleanCode}) berhasil didaftarkan!`,
            data: { 
                supplier_id: result.insertId, 
                supplier_code: cleanCode, 
                supplier_name: supplier_name.trim(),
                lead_time_days: parsedLeadTime
            }
        });
    } catch (error) {
        console.error('❌ Error createSupplier:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 4. Update Data Pemasok
exports.updateSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        const { supplier_name, contact_person, phone, email, address, lead_time_days, is_active } = req.body;

        const [existing] = await db.query('SELECT supplier_id FROM suppliers WHERE supplier_id = ?', [id]);
        if (!existing || existing.length === 0) {
            return res.status(404).json({ status: 'Error', message: `Pemasok ID ${id} tidak ditemukan.` });
        }

        const parsedLeadTime = lead_time_days !== undefined ? parseInt(lead_time_days, 10) : undefined;
        const parsedActive = is_active !== undefined ? (is_active ? 1 : 0) : undefined;

        await db.query(
            `UPDATE suppliers SET
                supplier_name = COALESCE(?, supplier_name),
                contact_person = COALESCE(?, contact_person),
                phone = COALESCE(?, phone),
                email = COALESCE(?, email),
                address = COALESCE(?, address),
                lead_time_days = COALESCE(?, lead_time_days),
                is_active = COALESCE(?, is_active)
             WHERE supplier_id = ?`,
            [
                supplier_name ? supplier_name.trim() : null,
                contact_person ? contact_person.trim() : null,
                phone ? phone.trim() : null,
                email ? email.trim() : null,
                address ? address.trim() : null,
                parsedLeadTime,
                parsedActive,
                id
            ]
        );

        res.json({
            status: 'Success',
            message: `Data pemasok ID ${id} berhasil diperbarui!`
        });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 5. Nonaktifkan / Hapus Pemasok (Soft Delete)
exports.deleteSupplier = async (req, res) => {
    try {
        const { id } = req.params;

        const [existing] = await db.query('SELECT supplier_id, supplier_name, is_active FROM suppliers WHERE supplier_id = ?', [id]);
        if (!existing || existing.length === 0) {
            return res.status(404).json({ status: 'Error', message: `Pemasok ID ${id} tidak ditemukan.` });
        }

        const newStatus = existing[0].is_active ? 0 : 1;
        await db.query('UPDATE suppliers SET is_active = ? WHERE supplier_id = ?', [newStatus, id]);

        res.json({
            status: 'Success',
            message: `Status pemasok '${existing[0].supplier_name}' diubah menjadi: ${newStatus ? 'AKTIF' : 'NON-AKTIF'}.`
        });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
};
