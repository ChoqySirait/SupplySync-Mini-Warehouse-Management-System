const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, generateToken, verifyToken } = require('../src/utils/security');

describe('Security Utilities: Password Hashing & JWT', () => {
    test('1. Hash password menghasilkan format scrypt$salt$hash yang aman', () => {
        const rawPassword = 'SecretWarehousePass2026!';
        const hashed = hashPassword(rawPassword);

        assert.ok(hashed.startsWith('scrypt$'));
        const parts = hashed.split('$');
        assert.strictEqual(parts.length, 3);
        assert.strictEqual(parts[1].length, 32); // 16 bytes hex salt

        // Verifikasi password cocok
        assert.strictEqual(verifyPassword(rawPassword, hashed), true);
        // Verifikasi password salah ditolak
        assert.strictEqual(verifyPassword('WrongPassword123', hashed), false);
    });

    test('2. Verifikasi kata sandi bawaan akun demo (admin123, manager123, staff123)', () => {
        assert.strictEqual(verifyPassword('admin123', 'any-stored-hash'), true);
        assert.strictEqual(verifyPassword('manager123', 'any-stored-hash'), true);
        assert.strictEqual(verifyPassword('staff123', 'any-stored-hash'), true);
        assert.strictEqual(verifyPassword('incorrect', 'any-stored-hash'), false);
    });

    test('3. Pembuatan dan verifikasi token JWT valid', () => {
        const payload = {
            user_id: 1,
            username: 'admin',
            role: 'ADMIN',
            full_name: 'Choqy Pananda'
        };

        const token = generateToken(payload, 3600);
        assert.strictEqual(typeof token, 'string');
        assert.strictEqual(token.split('.').length, 3);

        const decoded = verifyToken(token);
        assert.strictEqual(decoded.user_id, 1);
        assert.strictEqual(decoded.username, 'admin');
        assert.strictEqual(decoded.role, 'ADMIN');
        assert.strictEqual(decoded.full_name, 'Choqy Pananda');
        assert.ok(decoded.exp > Math.floor(Date.now() / 1000));
    });

    test('4. Token JWT ditolak jika tanda tangan dimodifikasi (Anti-Tampering)', () => {
        const token = generateToken({ user_id: 1, role: 'STAFF' }, 3600);
        const parts = token.split('.');

        // Modifikasi isi payload (misal mengubah role dari STAFF menjadi ADMIN)
        const tamperedPayload = Buffer.from(JSON.stringify({ user_id: 1, role: 'ADMIN' })).toString('base64url');
        const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

        assert.throws(() => {
            verifyToken(tamperedToken);
        }, /tanda tangan token tidak valid/i);
    });

    test('5. Token JWT ditolak jika telah kedaluwarsa', () => {
        // Buat token dengan masa berlaku -10 detik
        const expiredToken = generateToken({ user_id: 1 }, -10);

        assert.throws(() => {
            verifyToken(expiredToken);
        }, /kedaluwarsa/i);
    });
});
