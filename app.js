const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const apiRoutes = require('./src/routes/api');
const { errorHandler, notFoundHandler } = require('./src/middlewares/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Cross-Origin Middleware
app.use(cors());

// Basic Security Headers Middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Body Parser Middleware (JSON, Raw CSV text, & URL-encoded)
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Folder Statis Public untuk Frontend SPA
app.use(express.static(path.join(__dirname, 'public')));

// Register Router REST API
app.use('/api', apiRoutes);

// 404 Handler untuk Route API yang tidak terdaftar
app.use('/api', notFoundHandler);

// Fallback Route Serves Frontend index.html (SPA)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Centralized Error Handling Middleware
app.use(errorHandler);

// Jalankan Server jika dipanggil langsung
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Server SupplySync WMS berjalan di http://localhost:${PORT}`);
    });
}

module.exports = app;
