const db = require('../config/database');
const { verifyPassword, generateToken, hashPassword, revokeToken } = require('../utils/security');

/**
 * 1. Login Pengguna & Penerbitan JWT
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                status: 'Error',
                message: 'Username dan kata sandi wajib diisi.'
            });
        }

        const cleanUsername = username.trim().toLowerCase();

        // 1. Kueri data pengguna dari MySQL
        const [rows] = await db.query(
            `SELECT u.user_id, u.username, u.password_hash, u.full_name, u.role, u.is_active,
                    COALESCE(u.facility_id, 1) as facility_id,
                    f.facility_code, f.facility_name
             FROM users u
             LEFT JOIN warehouse_facilities f ON u.facility_id = f.facility_id
             WHERE LOWER(u.username) = ?`,
            [cleanUsername]
        );

        if (!rows || rows.length === 0) {
            return res.status(401).json({
                status: 'Error',
                message: 'Kredensial tidak valid: Username atau password salah.'
            });
        }

        const user = rows[0];

        // 2. Periksa status aktif akun
        if (!user.is_active) {
            return res.status(403).json({
                status: 'Error',
                message: 'Akun Anda berstatus non-aktif. Silakan hubungi Administrator sistem.'
            });
        }

        // 3. Verifikasi kata sandi secara aman dengan scrypt NIST
        const isMatch = verifyPassword(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({
                status: 'Error',
                message: 'Kredensial tidak valid: Username atau password salah.'
            });
        }

        // 4. Buat payload JWT & token
        const tokenPayload = {
            user_id: user.user_id,
            username: user.username,
            full_name: user.full_name,
            role: user.role,
            facility_id: user.facility_id || 1,
            facility_code: user.facility_code || 'WH-JKT-01',
            facility_name: user.facility_name || 'Gudang Pusat Cakung'
        };

        const token = generateToken(tokenPayload, 86400); // Masa berlaku 24 jam

        return res.json({
            status: 'Success',
            message: `Autentikasi berhasil. Selamat datang kembali, ${user.full_name}!`,
            token,
            user: tokenPayload,
            data: {
                token,
                user: tokenPayload
            }
        });

    } catch (error) {
        console.error('❌ Error pada login authController:', error.message);
        return res.status(500).json({ status: 'Error', message: 'Terjadi kesalahan sistem saat memproses login.' });
    }
};

/**
 * 2. Ambil Profil Pengguna Aktif (Me)
 * GET /api/auth/me
 */
exports.getMe = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ status: 'Error', message: 'Sesi tidak terautentikasi.' });
        }

        const [rows] = await db.query(
            `SELECT u.user_id, u.username, u.full_name, u.role, u.is_active, u.created_at,
                    COALESCE(u.facility_id, 1) as facility_id,
                    f.facility_code, f.facility_name, f.city
             FROM users u
             LEFT JOIN warehouse_facilities f ON u.facility_id = f.facility_id
             WHERE u.user_id = ?`,
            [req.user.user_id]
        );

        if (!rows || rows.length === 0) {
            return res.status(404).json({ status: 'Error', message: 'Data pengguna tidak ditemukan.' });
        }

        return res.json({
            status: 'Success',
            data: rows[0]
        });
    } catch (error) {
        return res.status(500).json({ status: 'Error', message: error.message });
    }
};

/**
 * 3. Logout Pengguna (Token Revocation)
 * POST /api/auth/logout
 */
exports.logout = async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') 
            ? authHeader.slice(7).trim() 
            : null;

        if (token) {
            revokeToken(token);
        }

        return res.json({
            status: 'Success',
            message: 'Logout berhasil. Sesi Anda telah diakhiri dengan aman.'
        });
    } catch (error) {
        return res.status(500).json({ status: 'Error', message: error.message });
    }
};

/**
 * 4. Ubah Kata Sandi Sendiri
 * POST /api/auth/change-password
 */
exports.changePassword = async (req, res) => {
    try {
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({
                status: 'Error',
                message: 'Kata sandi saat ini dan kata sandi baru wajib diisi.'
            });
        }

        if (new_password.length < 6) {
            return res.status(400).json({
                status: 'Error',
                message: 'Kata sandi baru minimal 6 karakter.'
            });
        }

        const [rows] = await db.query(
            'SELECT user_id, password_hash FROM users WHERE user_id = ?',
            [req.user.user_id]
        );

        if (!rows || rows.length === 0) {
            return res.status(404).json({ status: 'Error', message: 'Pengguna tidak ditemukan.' });
        }

        const isMatch = verifyPassword(current_password, rows[0].password_hash);
        if (!isMatch) {
            return res.status(400).json({
                status: 'Error',
                message: 'Kata sandi saat ini tidak sesuai.'
            });
        }

        const newHash = hashPassword(new_password);
        await db.query(
            'UPDATE users SET password_hash = ? WHERE user_id = ?',
            [newHash, req.user.user_id]
        );

        return res.json({
            status: 'Success',
            message: 'Kata sandi Anda berhasil diperbarui.'
        });
    } catch (error) {
        return res.status(500).json({ status: 'Error', message: error.message });
    }
};

/**
 * 5. Inisialisasi Administrator Pertama (Hanya jika belum ada user di database)
 * POST /api/auth/setup-admin
 */
exports.setupInitialAdmin = async (req, res) => {
    try {
        const [[countRow]] = await db.query('SELECT COUNT(*) AS total_users FROM users');
        if (countRow.total_users > 0) {
            return res.status(403).json({
                status: 'Error',
                message: 'Inisialisasi ditolak: Administrator sistem sudah pernah dikonfigurasi.'
            });
        }

        const { username, password, full_name } = req.body;
        if (!username || !password || !full_name) {
            return res.status(400).json({
                status: 'Error',
                message: 'Username, password, dan nama lengkap wajib diisi untuk inisialisasi awal.'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                status: 'Error',
                message: 'Kata sandi administrator awal minimal 8 karakter.'
            });
        }

        const cleanUsername = username.trim().toLowerCase();
        const hashedPassword = hashPassword(password);

        await db.query(
            `INSERT INTO users (username, password_hash, full_name, role, facility_id, is_active)
             VALUES (?, ?, ?, 'ADMIN', 1, 1)`,
            [cleanUsername, hashedPassword, full_name.trim()]
        );

        return res.status(201).json({
            status: 'Success',
            message: `Administrator awal '${cleanUsername}' berhasil dibuat. Silakan login ke aplikasi.`
        });
    } catch (error) {
        return res.status(500).json({ status: 'Error', message: error.message });
    }
};
