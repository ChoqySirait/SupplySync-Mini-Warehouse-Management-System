const { verifyToken } = require('../utils/security');

/**
 * Middleware Autentikasi Wajib (JWT Bearer Token)
 */
exports.authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7).trim() 
        : req.query.token;

    if (!token) {
        return res.status(401).json({
            status: 'Error',
            message: 'Akses ditolak: Token autentikasi tidak disertakan.'
        });
    }

    try {
        const decoded = verifyToken(token);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            status: 'Error',
            message: error.message
        });
    }
};

/**
 * Middleware Autentikasi Opsional (Fallback ke default user jika tidak ada token)
 */
exports.optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7).trim() 
        : req.query.token;

    if (token) {
        try {
            req.user = verifyToken(token);
        } catch {
            // Abaikan token jika invalid pada optional auth
            req.user = { user_id: 1, username: 'admin', role: 'ADMIN', full_name: 'Choqy Pananda' };
        }
    } else {
        req.user = { user_id: 1, username: 'admin', role: 'ADMIN', full_name: 'Choqy Pananda' };
    }

    next();
};

/**
 * Middleware Otorisasi Berdasarkan Role (RBAC)
 * @param {Array<string>} roles contoh: ['ADMIN', 'MANAGER']
 */
exports.authorizeRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                status: 'Error',
                message: 'Autentikasi diperlukan sebelum memeriksa hak akses.'
            });
        }

        const userRole = (req.user.role || '').toUpperCase();
        const allowed = roles.map(r => r.toUpperCase());

        if (!allowed.includes(userRole)) {
            return res.status(403).json({
                status: 'Error',
                message: `Akses ditolak: Hak akses role '${userRole}' tidak diizinkan untuk tindakan ini (Diperlukan: ${allowed.join(' / ')}).`
            });
        }

        next();
    };
};
