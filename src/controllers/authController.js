const db = require('../config/database');
const { verifyPassword, generateToken, hashPassword } = require('../utils/security');

// Akun Demo Cadangan jika database belum terisi
const DEMO_USERS = [
    { user_id: 1, username: 'admin', role: 'ADMIN', full_name: 'Choqy Pananda' },
    { user_id: 2, username: 'manager', role: 'MANAGER', full_name: 'Siti Rahmawati' },
    { user_id: 3, username: 'staff', role: 'STAFF', full_name: 'Budi Santoso' }
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
                `SELECT user_id, username, password_hash, full_name, role, is_active 
                 FROM users 
                 WHERE LOWER(username) = ? AND is_active = 1`,
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
            role: user.role
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
                `SELECT user_id, username, full_name, role, is_active, created_at 
                 FROM users 
                 WHERE is_active = 1 
                 ORDER BY role ASC, full_name ASC`
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
