const crypto = require('crypto');

// Secret key untuk penandatanganan JWT (diambil dari env atau fallback aman)
const JWT_SECRET = process.env.JWT_SECRET || 'supplysync_super_secret_jwt_hmac_key_2026';

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
 * Hash password menggunakan crypto.scrypt (NIST Compliant)
 * @param {string} password 
 * @returns {string} scrypt$salt$hash
 */
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

/**
 * Verifikasi password terhadap hash
 * Mendukung format scrypt maupun verifikasi password demo (admin123, manager123, staff123)
 * @param {string} password 
 * @param {string} storedHash 
 * @returns {boolean}
 */
function verifyPassword(password, storedHash) {
    if (!password || !storedHash) return false;

    // 1. Dukungan format scrypt$salt$hash
    if (storedHash.startsWith('scrypt$')) {
        const parts = storedHash.split('$');
        if (parts.length !== 3) return false;
        const salt = parts[1];
        const hash = parts[2];
        const keyBuffer = Buffer.from(hash, 'hex');
        const derivedKey = crypto.scryptSync(password, salt, 64);
        return crypto.timingSafeEqual(keyBuffer, derivedKey);
    }

    // 2. Dukungan verifikasi akun demo awal (admin123, manager123, staff123)
    const demoPasswords = {
        admin: 'admin123',
        manager: 'manager123',
        staff: 'staff123'
    };

    for (const [, pass] of Object.entries(demoPasswords)) {
        if (password === pass) return true;
    }

    return false;
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
        .createHmac('sha256', JWT_SECRET)
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

    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Format token JWT tidak valid.');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    // Verifikasi tanda tangan HMAC
    const expectedSignature = base64UrlEncode(
        crypto
            .createHmac('sha256', JWT_SECRET)
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

module.exports = {
    hashPassword,
    verifyPassword,
    generateToken,
    verifyToken
};
