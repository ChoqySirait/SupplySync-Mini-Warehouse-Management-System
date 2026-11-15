const db = require('../config/database');
const { hashPassword } = require('../utils/security');

/**
 * SupplySync WMS - Enterprise User & RBAC Management Controller
 */

// 1. Ambil Daftar Semua Pengguna (Hanya ADMIN / MANAGER)
exports.getAllUsers = async (req, res) => {
    try {
        const { role, facility_id, search, is_active } = req.query;

        let query = `
            SELECT u.user_id, u.username, u.full_name, u.role, u.is_active, u.created_at, u.updated_at,
                   COALESCE(u.facility_id, 1) as facility_id,
                   f.facility_code, f.facility_name, f.city
            FROM users u
            LEFT JOIN warehouse_facilities f ON u.facility_id = f.facility_id
            WHERE 1=1
        `;
        const params = [];

        if (role) {
            query += ` AND u.role = ?`;
            params.push(role.toUpperCase());
        }

        if (facility_id) {
            query += ` AND u.facility_id = ?`;
            params.push(facility_id);
        }

        if (is_active !== undefined && is_active !== '') {
            query += ` AND u.is_active = ?`;
            params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
        }

        if (search) {
            query += ` AND (u.username LIKE ? OR u.full_name LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ` ORDER BY u.role ASC, u.full_name ASC;`;

        const [users] = await db.query(query, params);

        return res.json({
            status: 'Success',
            count: users.length,
            data: users
        });
    } catch (error) {
        console.error('❌ Error getAllUsers:', error.message);
        return res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 2. Ambil Rincian Pengguna Berdasarkan ID
exports.getUserById = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            `SELECT u.user_id, u.username, u.full_name, u.role, u.is_active, u.created_at, u.updated_at,
                    COALESCE(u.facility_id, 1) as facility_id,
                    f.facility_code, f.facility_name, f.city
             FROM users u
             LEFT JOIN warehouse_facilities f ON u.facility_id = f.facility_id
             WHERE u.user_id = ?`,
            [id]
        );

        if (!rows || rows.length === 0) {
            return res.status(404).json({ status: 'Error', message: `Pengguna dengan ID '${id}' tidak ditemukan.` });
        }

        // Ambil juga aktivitas transaksi terbaru yang dilakukan oleh pengguna ini
        const [recentActivity] = await db.query(
            `SELECT transaction_id, reference_no, product_id, transaction_type, quantity, notes, created_at
             FROM stock_transactions
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 10;`,
            [id]
        );

        return res.json({
            status: 'Success',
            data: {
                ...rows[0],
                recent_activity: recentActivity || []
            }
        });
    } catch (error) {
        return res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 3. Tambah Pengguna Baru (ADMIN Only)
exports.createUser = async (req, res) => {
    try {
        const { username, password, full_name, role, facility_id } = req.body;

        if (!username || !password || !full_name) {
            return res.status(400).json({
                status: 'Error',
                message: 'Username, password, dan nama lengkap wajib diisi.'
            });
        }

        const cleanUsername = username.trim().toLowerCase();
        if (cleanUsername.length < 3 || cleanUsername.length > 50) {
            return res.status(400).json({
                status: 'Error',
                message: 'Username harus memiliki panjang 3 hingga 50 karakter.'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                status: 'Error',
                message: 'Kata sandi minimal 6 karakter.'
            });
        }

        const validRoles = ['ADMIN', 'MANAGER', 'STAFF'];
        const userRole = validRoles.includes((role || '').toUpperCase()) ? role.toUpperCase() : 'STAFF';

        // Cek duplikasi username
        const [existing] = await db.query('SELECT user_id FROM users WHERE LOWER(username) = ?', [cleanUsername]);
        if (existing && existing.length > 0) {
            return res.status(409).json({
                status: 'Error',
                message: `Username '${cleanUsername}' sudah digunakan oleh pengguna lain.`
            });
        }

        // Verifikasi fasilitas gudang jika ditentukan
        const targetFacilityId = facility_id ? parseInt(facility_id, 10) : 1;
        const [facs] = await db.query('SELECT facility_id FROM warehouse_facilities WHERE facility_id = ?', [targetFacilityId]);
        if (!facs || facs.length === 0) {
            return res.status(400).json({
                status: 'Error',
                message: `Fasilitas gudang ID ${targetFacilityId} tidak ditemukan.`
            });
        }

        const passwordHash = hashPassword(password);

        const [result] = await db.query(
            `INSERT INTO users (username, password_hash, full_name, role, facility_id, is_active)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [cleanUsername, passwordHash, full_name.trim(), userRole, targetFacilityId]
        );

        return res.status(201).json({
            status: 'Success',
            message: `Pengguna '${full_name}' (@${cleanUsername}) berhasil didaftarkan sebagai ${userRole}!`,
            data: {
                user_id: result.insertId,
                username: cleanUsername,
                full_name: full_name.trim(),
                role: userRole,
                facility_id: targetFacilityId
            }
        });
    } catch (error) {
        console.error('❌ Error createUser:', error.message);
        return res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 4. Perbarui Pengguna (ADMIN Only)
exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { full_name, role, facility_id, is_active } = req.body;

        const [existing] = await db.query('SELECT user_id, username FROM users WHERE user_id = ?', [id]);
        if (!existing || existing.length === 0) {
            return res.status(404).json({ status: 'Error', message: `Pengguna ID ${id} tidak ditemukan.` });
        }

        const validRoles = ['ADMIN', 'MANAGER', 'STAFF'];
        const updatedRole = role && validRoles.includes(role.toUpperCase()) ? role.toUpperCase() : undefined;
        const updatedFacility = facility_id !== undefined ? parseInt(facility_id, 10) : undefined;
        const updatedActive = is_active !== undefined ? (is_active ? 1 : 0) : undefined;

        await db.query(
            `UPDATE users SET
                full_name = COALESCE(?, full_name),
                role = COALESCE(?, role),
                facility_id = COALESCE(?, facility_id),
                is_active = COALESCE(?, is_active)
             WHERE user_id = ?`,
            [full_name ? full_name.trim() : null, updatedRole || null, updatedFacility !== undefined ? updatedFacility : null, updatedActive !== undefined ? updatedActive : null, id]
        );

        return res.json({
            status: 'Success',
            message: `Data pengguna ID ${id} berhasil diperbarui.`
        });
    } catch (error) {
        return res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 5. Reset Password Pengguna oleh Admin (ADMIN Only)
exports.resetUserPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { new_password } = req.body;

        if (!new_password || new_password.length < 6) {
            return res.status(400).json({
                status: 'Error',
                message: 'Kata sandi baru wajib diisi minimal 6 karakter.'
            });
        }

        const [existing] = await db.query('SELECT user_id, username FROM users WHERE user_id = ?', [id]);
        if (!existing || existing.length === 0) {
            return res.status(404).json({ status: 'Error', message: `Pengguna ID ${id} tidak ditemukan.` });
        }

        const newHash = hashPassword(new_password);
        await db.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [newHash, id]);

        return res.json({
            status: 'Success',
            message: `Kata sandi untuk pengguna '@${existing[0].username}' berhasil di-reset.`
        });
    } catch (error) {
        return res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 6. Nonaktifkan / Aktifkan Akun Pengguna (Toggle Active)
exports.toggleUserStatus = async (req, res) => {
    try {
        const { id } = req.params;

        // Cegah admin menonaktifkan akunnya sendiri
        if (parseInt(id, 10) === parseInt(req.user.user_id, 10)) {
            return res.status(400).json({
                status: 'Error',
                message: 'Anda tidak dapat menonaktifkan akun Anda sendiri saat sedang login.'
            });
        }

        const [existing] = await db.query('SELECT user_id, username, is_active FROM users WHERE user_id = ?', [id]);
        if (!existing || existing.length === 0) {
            return res.status(404).json({ status: 'Error', message: `Pengguna ID ${id} tidak ditemukan.` });
        }

        const newStatus = existing[0].is_active ? 0 : 1;
        await db.query('UPDATE users SET is_active = ? WHERE user_id = ?', [newStatus, id]);

        return res.json({
            status: 'Success',
            message: `Status akun '@${existing[0].username}' berhasil diubah menjadi: ${newStatus ? 'AKTIF' : 'NON-AKTIF'}.`,
            is_active: newStatus
        });
    } catch (error) {
        return res.status(500).json({ status: 'Error', message: error.message });
    }
};
