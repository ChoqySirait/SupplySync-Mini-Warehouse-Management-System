const { verifyToken } = require('../utils/security');
const db = require('../config/database');

/**
 * Middleware Autentikasi Wajib (JWT Bearer Token / Cookie)
 */
exports.authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7).trim() 
        : req.query.token;

    // Dukungan Cookie HttpOnly jika tersedia
    if (!token && req.cookies && req.cookies.supplysync_token) {
        token = req.cookies.supplysync_token;
    }

    if (!token) {
        return res.status(401).json({
            status: 'Error',
            message: 'Akses ditolak: Token autentikasi tidak disertakan atau sesi tidak valid.'
        });
    }

    try {
        const decoded = verifyToken(token);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            status: 'Error',
            message: error.message || 'Sesi otorisasi tidak valid.'
        });
    }
};

/**
 * Middleware Autentikasi Opsional
 */
exports.optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7).trim() 
        : req.query.token;

    if (!token && req.cookies && req.cookies.supplysync_token) {
        token = req.cookies.supplysync_token;
    }

    if (token) {
        try {
            req.user = verifyToken(token);
        } catch {
            req.user = null;
        }
    } else {
        req.user = null;
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
                message: 'Autentikasi diperlukan sebelum memeriksa hak akses pengguna.'
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

/**
 * Middleware Scoping Fasilitas Gudang (Multi-Facility Scoping)
 * Memastikan operator role STAFF hanya dapat memanipulasi data fasilitas gudang tempat ia ditugaskan.
 * ADMIN dan MANAGER memiliki hak akses multi-fasilitas (lintas gudang).
 */
exports.requireFacilityScope = (options = {}) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                status: 'Error',
                message: 'Autentikasi diperlukan sebelum memeriksa fasilitas gudang.'
            });
        }

        const userRole = (req.user.role || '').toUpperCase();
        const userFacilityId = req.user.facility_id || 1;

        // ADMIN dan MANAGER bebas mengelola seluruh fasilitas (Cross-Facility Clearance)
        if (userRole === 'ADMIN' || userRole === 'MANAGER') {
            return next();
        }

        // Untuk STAFF:
        const targetFacilityId = req.body?.facility_id || req.query?.facility_id || req.params?.facility_id;

        if (targetFacilityId && parseInt(targetFacilityId, 10) !== parseInt(userFacilityId, 10)) {
            return res.status(403).json({
                status: 'Error',
                message: `Akses ditolak: Staf hanya diizinkan mengelola operasional pada fasilitas gudang yang ditugaskan (Fasilitas Pengguna: ${userFacilityId}, Target: ${targetFacilityId}).`
            });
        }

        // Jika request body tidak menyertakan facility_id, pasang otomatis facility_id milik staf
        if (req.body && !req.body.facility_id) {
            req.body.facility_id = userFacilityId;
        }

        // Jika operasi menyertakan location_id, verifikasi bahwa lokasi tersebut berada dalam fasilitas staf
        const locationId = req.body?.location_id || req.query?.location_id;
        if (locationId) {
            try {
                const [locs] = await db.query(
                    'SELECT location_id, facility_id, location_code FROM warehouse_locations WHERE location_id = ?',
                    [locationId]
                );
                if (locs && locs.length > 0) {
                    const loc = locs[0];
                    if (parseInt(loc.facility_id, 10) !== parseInt(userFacilityId, 10)) {
                        return res.status(403).json({
                            status: 'Error',
                            message: `Akses ditolak: Lokasi rak '${loc.location_code}' berada di fasilitas lain (Fasilitas ID: ${loc.facility_id}). Anda hanya ditugaskan di Fasilitas ID: ${userFacilityId}.`
                        });
                    }
                }
            } catch (err) {
                console.warn('⚠️ Catatan requireFacilityScope:', err.message);
            }
        }

        next();
    };
};
