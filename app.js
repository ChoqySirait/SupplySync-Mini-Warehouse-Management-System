const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const apiRoutes = require('./src/routes/api');
const { errorHandler, notFoundHandler } = require('./src/middlewares/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// 1. Enterprise Security Headers Middleware (OWASP & NIST Compliant)
app.use((req, res, next) => {
    if (typeof res.removeHeader === 'function') {
        try { res.removeHeader('X-Powered-By'); } catch (_) {}
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'");
    next();
});

// 2. CORS Allowlist & Configuration
const corsOptions = {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));

// 3. In-Memory Rate Limiting untuk Proteksi Brute Force pada Login
const loginAttempts = new Map();
app.use('/api/auth/login', (req, res, next) => {
    if (req.method !== 'POST') return next();

    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown-client';
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 menit
    const maxAttempts = 30;

    let record = loginAttempts.get(clientIp);
    if (!record || now - record.startTime > windowMs) {
        record = { count: 1, startTime: now };
        loginAttempts.set(clientIp, record);
    } else {
        record.count++;
    }

    if (record.count > maxAttempts) {
        return res.status(429).json({
            status: 'Error',
            message: 'Terlalu banyak percobaan autentikasi. Silakan tunggu 15 menit sebelum mencoba kembali.'
        });
    }

    next();
});

// 4. Body Parser Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Folder Statis Public untuk Frontend SPA
app.use(express.static(path.join(__dirname, 'public')));

// 6. Register Router REST API
app.use('/api', apiRoutes);

// 7. 404 Handler untuk Route API yang tidak terdaftar
app.use('/api', notFoundHandler);

// 8. Fallback Route Serves Frontend index.html (SPA)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 9. Centralized Error Handling Middleware
app.use(errorHandler);

// Jalankan Server jika dipanggil langsung
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Server SupplySync Enterprise WMS berjalan di http://localhost:${PORT}`);
    });
}

module.exports = app;
