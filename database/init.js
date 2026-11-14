const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { runPendingMigrations } = require('./migrator');
require('dotenv').config();

async function initDatabase(options = {}) {
    console.log('🔄 Memulai inisialisasi basis data SupplySync WMS...');

    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT, 10) || 3306;
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';
    const database = process.env.DB_NAME || 'supplysync_db';
    const isFresh = options.fresh || process.argv.includes('--fresh');

    let connection;
    try {
        // Hubungkan tanpa nama basis data untuk memastikan database dibuat
        connection = await mysql.createConnection({
            host,
            port,
            user,
            password,
            multipleStatements: true,
            timezone: '+07:00'
        });

        console.log(`📡 Berhasil terhubung ke MySQL Server di ${host}:${port}`);

        if (isFresh) {
            console.log(`⚠️ Menjalankan FRESH INSTALLATION dari database/schema_fresh.sql...`);
            const freshSql = fs.readFileSync(path.join(__dirname, 'schema_fresh.sql'), 'utf8');
            await connection.query(freshSql);
            console.log('✅ Skema basis data baru berhasil diinstalasi bersih!');
        } else {
            console.log(`🚀 Menjalankan DDL non-destruktif dari database/schema.sql...`);
            const baseSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
            await connection.query(baseSql);
            console.log('✅ Skema dasar non-destruktif berhasil diverifikasi/diterapkan.');

            // Jalankan migrasi berversi otomatis jika ada
            console.log('🚀 Menjalankan migrator otomatis untuk migrasi tertunda...');
            await runPendingMigrations();
        }

        console.log(`\n🎉 Inisialisasi basis data '${database}' sukses tanpa kehilangan data operasional!`);
    } catch (error) {
        console.error('❌ Gagal menginisialisasi basis data:', error.message);
        process.exitCode = 1;
        throw error;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

if (require.main === module) {
    initDatabase().catch(() => {
        process.exitCode = 1;
    });
}

module.exports = initDatabase;
