const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Impor file koneksi database yang baru kita buat
const db = require('./src/config/database');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Menyajikan file frontend (HTML, CSS, JS)

// Route Pengujian Sederhana (Root API)
app.get('/api/health', async (req, res) => {
    try {
        // Jalankan query tes sederhana ke database
        const [rows] = await db.query('SELECT 1 + 1 AS result');
        res.json({
            status: 'Success',
            message: 'Server dan Database berjalan normal!',
            db_test: rows[0].result
        });
    } catch (error) {
        res.status(500).json({
            status: 'Error',
            message: 'Gagal terhubung ke database',
            error: error.message
        });
    }
});

// Jalankan Server Express
app.listen(PORT, () => {
    console.log(`🚀 Server SupplySync berjalan di http://localhost:${PORT}`);
});