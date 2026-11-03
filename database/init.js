const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function initDatabase() {
    console.log('🔄 Memulai inisialisasi database SupplySync...');

    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT, 10) || 3306;
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';
    const database = process.env.DB_NAME || 'supplysync_db';

    let connection;
    try {
        // Connect initially without database name to ensure DB exists
        connection = await mysql.createConnection({
            host,
            port,
            user,
            password,
            multipleStatements: true
        });

        console.log(`📡 Berhasil terhubung ke MySQL di ${host}:${port}`);

        const schemaPath = path.join(__dirname, 'schema.sql');
        const sql = fs.readFileSync(schemaPath, 'utf8');

        console.log(`🚀 Menjalankan DDL & Seeder dari database/schema.sql ke database '${database}'...`);
        await connection.query(sql);

        console.log('✅ Skema dan data awal database SupplySync berhasil diterapkan!');
    } catch (error) {
        console.error('❌ Gagal menginisialisasi database:', error.message);
        process.exitCode = 1;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

if (require.main === module) {
    initDatabase();
}

module.exports = initDatabase;
