const mysql = require('mysql2');
require('dotenv').config();

// Membuat connection pool agar manajemen query lebih efisien & cepat
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'supplysync_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+07:00'
});

// Mengubah pool menjadi promise agar bisa menggunakan async/await saat query
const db = pool.promise();

// Cek koneksi ke database saat pertama kali dijalankan
pool.getConnection((err, connection) => {
    if (err) {
        console.warn('⚠️ Peringatan Koneksi Database:', err.message);
    } else {
        console.log('✅ Berhasil terhubung ke database MySQL (supplysync_db)');
        connection.release();
    }
});

module.exports = db;
