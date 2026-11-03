const db = require('../config/database');
const { verifyPassword, generateToken, hashPassword } = require('../utils/security');

// Akun Demo Cadangan jika database belum terisi
const DEMO_USERS = [
    { 
        user_id: 1, 
        username: 'admin', 
        role: 'ADMIN', 
        full_name: 'Choqy Pananda', 
        facility_id: 1, 
        facility_code: 'WH-JKT-01', 
        facility_name: 'Gudang Pusat Cakung (Semua Cabang)' 
    },
    { 
        user_id: 2, 
        username: 'manager', 
        role: 'MANAGER', 
        full_name: 'Siti Rahmawati', 
        facility_id: 1, 
        facility_code: 'WH-JKT-01', 
        facility_name: 'Gudang Pusat Cakung (Regional Hub)' 
    },
    { 
        user_id: 3, 
        username: 'staff', 
        role: 'STAFF', 
        full_name: 'Budi Santoso', 
        facility_id: 1, 
        facility_code: 'WH-JKT-01', 
        facility_name: 'Gudang Pusat Cakung' 
    },
    { 
        user_id: 4, 
        username: 'staff_sby', 
        role: 'STAFF', 
        full_name: 'Surya Pratama', 
        facility_id: 2, 
        facility_code: 'WH-SBY-01', 
        facility_name: 'Cold Storage Rungkut' 
    }
];

// 1. Login User & Terbitkan JWT
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

        // 1. Cek ke database MySQL
        let user = null;
        try {
            const [rows] = await db.query(
                `SELECT u.user_id, u.username, u.password_hash, u.full_name, u.role, u.is_active,
                        COALESCE(u.facility_id, 1) as facility_id,
                        f.facility_code, f.facility_name
                 FROM users u
                 LEFT JOIN warehouse_facilities f ON u.facility_id = f.facility_id
                 WHERE LOWER(u.username) = ? AND u.is_active = 1`,
                [cleanUsername]
            );
            if (rows && rows.length > 0) {
                user = rows[0];
            }
        } catch (dbErr) {
            console.warn('⚠️ Gagal kueri users ke MySQL, mencoba fallback demo akun:', dbErr.message);
        }

        // 2. Fallback ke DEMO_USERS jika DB kosong/belum terhubung
        if (!user) {
            const foundDemo = DEMO_USERS.find(u => u.username === cleanUsername);
            if (foundDemo && verifyPassword(password, foundDemo.username + '123')) {
                user = { ...foundDemo, password_hash: '' };
            }
        }

        if (!user) {
            return res.status(401).json({
                status: 'Error',
                message: 'Kredensial tidak valid: Username atau password salah.'
            });
        }

        // 3. Verifikasi kata sandi jika ada hash di DB
        if (user.password_hash) {
            const isMatch = verifyPassword(password, user.password_hash);
            if (!isMatch) {
                return res.status(401).json({
                    status: 'Error',
                    message: 'Kredensial tidak valid: Username atau password salah.'
                });
            }
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

        const token = generateToken(tokenPayload, 86400); // 24 jam

        res.json({
            status: 'Success',
            message: `Selamat datang kembali, ${user.full_name}!`,
            token,
            user: tokenPayload
        });

    } catch (error) {
        console.error('❌ Error pada login authController:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 2. Ambil Profil Pengguna Aktif (Me)
exports.getMe = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ status: 'Error', message: 'Tidak terautentikasi.' });
        }

        res.json({
            status: 'Success',
            data: req.user
        });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 3. Ambil Daftar Seluruh Pengguna (Untuk Admin / Operator Switcher)
exports.getAllUsers = async (req, res) => {
    try {
        let users = [];
        try {
            const [rows] = await db.query(
                `SELECT u.user_id, u.username, u.full_name, u.role, u.is_active, u.created_at,
                        COALESCE(u.facility_id, 1) as facility_id,
                        f.facility_code, f.facility_name
                 FROM users u
                 LEFT JOIN warehouse_facilities f ON u.facility_id = f.facility_id
                 WHERE u.is_active = 1 
                 ORDER BY u.role ASC, u.full_name ASC`
            );
            users = rows;
        } catch {
            users = DEMO_USERS;
        }

        res.json({
            status: 'Success',
            count: users.length,
            data: users
        });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
};
