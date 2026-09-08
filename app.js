const express = require('express');
const cors = require('cors');
require('dotenv').config();

const db = require('./src/config/database');
const apiRoutes = require('./src/routes/api'); // 1. Impor file router

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 2. Hubungkan Endpoint API
app.use('/api', apiRoutes);

// Route Pengujian Health Check
app.get('/api/health', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT 1 + 1 AS result');
        res.json({
            status: 'Success',
            message: 'Server dan Database berjalan normal!',
            db_test: rows[0].result
        });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
});

// Jalankan Server Express
app.listen(PORT, () => {
    console.log(`🚀 Server SupplySync berjalan di http://localhost:${PORT}`);
});