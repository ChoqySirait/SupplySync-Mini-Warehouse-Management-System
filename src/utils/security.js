const crypto = require('crypto');

// In-memory blacklist untuk token yang telah di-revoke / logout
const revokedTokens = new Set();

/**
 * Mengambil secret key JWT secara aman
 */
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (process.env.NODE_ENV === 'production') {
        if (!secret || secret.length < 32) {
            throw new Error('FATAL SECURITY: Variabel lingkungan JWT_SECRET minimal 32 karakter wajib dikonfigurasi pada mode produksi!');
        }
        return secret;
    }
    return secret || 'supplysync_super_secret_jwt_hmac_key_2026_dev_mode';
}

/**
 * Base64URL encoding (RFC 7515)
 */
function base64UrlEncode(str) {
    return Buffer.from(str)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

/**
 * Base64URL decoding
 */
function base64UrlDecode(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    return Buffer.from(base64, 'base64').toString();
}

/**
 * Hash password menggunakan crypto.scrypt (NIST SP 800-63B Compliant)
 * @param {string} password
 * @returns {string} scrypt$salt$hash (16 bytes salt + 64 bytes derived key)
 */
function hashPassword(password) {
    if (!password || typeof password !== 'string') {
        throw new Error('Password wajib berupa teks yang valid.');
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

/**
 * Verifikasi password terhadap hash scrypt dengan perlindungan Timing Attacks & Buffer Length Safety
 * @param {string} password
 * @param {string} storedHash
 * @returns {boolean}
 */
function verifyPassword(password, storedHash) {
    if (!password || !storedHash || typeof password !== 'string' || typeof storedHash !== 'string') {
        return false;
    }

    try {
        if (!storedHash.startsWith('scrypt$')) {
            return false;
        }

        const parts = storedHash.split('$');
        if (parts.length !== 3) {
            return false;
        }

        const salt = parts[1];
        const hash = parts[2];

        // Validasi panjang salt (16 bytes = 32 hex) dan hash (64 bytes = 128 hex)
        if (!salt || salt.length !== 32 || !hash || hash.length !== 128) {
            return false;
        }

        const keyBuffer = Buffer.from(hash, 'hex');
        const derivedKey = crypto.scryptSync(password, salt, 64);

        if (keyBuffer.length !== derivedKey.length) {
            return false;
        }

        return crypto.timingSafeEqual(keyBuffer, derivedKey);
    } catch {
        return false;
    }
}

/**
 * Generate standard HMAC-SHA256 JWT Token
 * @param {object} payload
 * @param {number} expiresInSeconds (default 24 jam)
 * @returns {string} jwtToken
 */
function generateToken(payload, expiresInSeconds = 86400) {
    const header = {
        alg: 'HS256',
        typ: 'JWT'
    };

    const now = Math.floor(Date.now() / 1000);
    const fullPayload = {
        ...payload,
        iat: now,
        exp: now + expiresInSeconds
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

    const signature = crypto
        .createHmac('sha256', getJwtSecret())
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest();

    const encodedSignature = base64UrlEncode(signature);
    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

/**
 * Verifikasi JWT Token dan mengembalikan payload jika valid
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyToken(token) {
    if (!token || typeof token !== 'string') {
        throw new Error('Token otorisasi tidak ditemukan.');
    }

    // Periksa apakah token ada dalam daftar blacklist logout
    if (revokedTokens.has(token)) {
        throw new Error('Sesi telah kedaluwarsa atau pengguna telah logout. Silakan login kembali.');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Format token JWT tidak valid.');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    // Verifikasi tanda tangan HMAC
    const expectedSignature = base64UrlEncode(
        crypto
            .createHmac('sha256', getJwtSecret())
            .update(`${encodedHeader}.${encodedPayload}`)
            .digest()
    );

    if (encodedSignature !== expectedSignature) {
        throw new Error('Tanda tangan token tidak valid atau telah dimodifikasi.');
    }

    // Verifikasi kedaluwarsa
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
        throw new Error('Sesi token otorisasi telah kedaluwarsa. Silakan login kembali.');
    }

    return payload;
}

/**
 * Revoke / masukkan token ke daftar hitam (Blacklist) saat logout
 * @param {string} token
 */
function revokeToken(token) {
    if (token && typeof token === 'string') {
        revokedTokens.add(token);
    }
}

/**
 * Bersihkan token kedaluwarsa dari memori secara berkala
 */
function cleanupRevokedTokens() {
    const now = Math.floor(Date.now() / 1000);
    for (const token of revokedTokens) {
        try {
            const parts = token.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(base64UrlDecode(parts[1]));
                if (payload.exp && payload.exp < now) {
                    revokedTokens.delete(token);
                }
            }
        } catch {
            revokedTokens.delete(token);
        }
    }
}

// Jalankan pembersihan blacklist setiap 1 jam
setInterval(cleanupRevokedTokens, 3600000).unref();

module.exports = {
    getJwtSecret,
    hashPassword,
    verifyPassword,
    generateToken,
    verifyToken,
    revokeToken
};
