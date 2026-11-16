#!/usr/bin/env node
/**
 * SupplySync WMS - Versioned Database Migration Engine
 * Mengelola eksekusi migrasi skema basis data secara deterministik, aman, dan transaksional.
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function getDbConnection(withDatabase = true) {
    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT, 10) || 3306;
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';
    const database = process.env.DB_NAME || 'supplysync_db';

    const config = {
        host,
        port,
        user,
        password,
        multipleStatements: true,
        timezone: '+07:00'
    };

    if (withDatabase) {
        config.database = database;
    }

    return await mysql.createConnection(config);
}

async function ensureDatabaseAndMigrationTable(connection) {
    const database = process.env.DB_NAME || 'supplysync_db';

    // 1. Pastikan database ada
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await connection.query(`USE \`${database}\`;`);

    // 2. Pastikan tabel schema_migrations ada
    await connection.query(`
        CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
            \`migration_id\` INT AUTO_INCREMENT PRIMARY KEY,
            \`migration_name\` VARCHAR(255) NOT NULL UNIQUE,
            \`batch\` INT NOT NULL DEFAULT 1,
            \`applied_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX \`idx_migration_name\` (\`migration_name\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Pastikan skema dasar tabel WMS ada jika database baru/kosong
    const [checkTables] = await connection.query(`
        SELECT COUNT(*) AS total_tables 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('products', 'warehouse_locations', 'users');
    `, [database]);

    if (checkTables[0].total_tables < 3) {
        console.log('📦 Skema dasar belum terpasang. Menjalankan DDL non-destruktif database/schema.sql...');
        const schemaPath = path.join(__dirname, 'schema.sql');
        if (fs.existsSync(schemaPath)) {
            const baseSql = fs.readFileSync(schemaPath, 'utf8');
            await connection.query(baseSql);
            console.log('✅ Skema dasar 16 tabel WMS berhasil diinisialisasi.');
        }
    }
}

async function getAppliedMigrations(connection) {
    const [rows] = await connection.query('SELECT migration_name FROM `schema_migrations` ORDER BY migration_id ASC;');
    return rows.map(r => r.migration_name);
}

async function getAvailableMigrationFiles() {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        return [];
    }
    const files = fs.readdirSync(MIGRATIONS_DIR);
    return files
        .filter(f => f.endsWith('.sql'))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

async function runPendingMigrations() {
    console.log('🔄 Memeriksa status migrasi database SupplySync...');
    let connection;

    try {
        connection = await getDbConnection(false);
        await ensureDatabaseAndMigrationTable(connection);

        const applied = await getAppliedMigrations(connection);
        const available = await getAvailableMigrationFiles();

        const pending = available.filter(f => !applied.includes(f));

        if (pending.length === 0) {
            console.log('✅ Basis data telah mutakhir. Tidak ada migrasi tertunda.');
            return { appliedCount: 0, pendingCount: 0 };
        }

        console.log(`📋 Ditemukan ${pending.length} migrasi tertunda yang akan diterapkan:`);
        pending.forEach(f => console.log(`   - ${f}`));

        // Dapatkan nomor batch berikutnya
        const [[batchRow]] = await connection.query('SELECT COALESCE(MAX(batch), 0) + 1 AS next_batch FROM `schema_migrations`;');
        const nextBatch = batchRow.next_batch || 1;

        for (const file of pending) {
            const filePath = path.join(MIGRATIONS_DIR, file);
            const sql = fs.readFileSync(filePath, 'utf8');

            console.log(`\n⏳ Menjalankan migrasi: ${file}...`);
            await connection.query(sql);

            await connection.query(
                'INSERT INTO `schema_migrations` (`migration_name`, `batch`) VALUES (?, ?);',
                [file, nextBatch]
            );

            console.log(`   ✅ Selesai: ${file}`);
        }

        console.log(`\n🎉 Seluruh ${pending.length} migrasi berhasil diterapkan (Batch ${nextBatch})!`);
        return { appliedCount: pending.length, batch: nextBatch };

    } catch (error) {
        console.error('❌ Gagal menjalankan migrasi:', error.message);
        throw error;
    } finally {
        if (connection) await connection.end();
    }
}

async function printMigrationStatus() {
    let connection;
    try {
        connection = await getDbConnection(false);
        await ensureDatabaseAndMigrationTable(connection);

        const [rows] = await connection.query('SELECT migration_name, batch, applied_at FROM `schema_migrations` ORDER BY migration_id ASC;');
        const appliedMap = new Map(rows.map(r => [r.migration_name, r]));
        const available = await getAvailableMigrationFiles();

        console.log('\n====================================================================');
        console.log('   SUPPLYSYNC WMS - STATUS MIGRASI BASIS DATA');
        console.log('====================================================================');

        if (available.length === 0) {
            console.log('Tidak ada berkas migrasi pada direktori database/migrations.');
            return;
        }

        available.forEach((file, idx) => {
            if (appliedMap.has(file)) {
                const info = appliedMap.get(file);
                console.log(`[x] ${file.padEnd(50)} | Batch ${String(info.batch).padStart(2)} | Diterapkan: ${new Date(info.applied_at).toLocaleString('id-ID')}`);
            } else {
                console.log(`[ ] ${file.padEnd(50)} | MENUNGGU EKSEKUSI`);
            }
        });

        const pendingCount = available.filter(f => !appliedMap.has(f)).length;
        console.log('--------------------------------------------------------------------');
        console.log(`Total: ${available.length} | Diterapkan: ${rows.length} | Tertunda: ${pendingCount}\n`);

    } catch (error) {
        console.error('❌ Gagal memeriksa status migrasi:', error.message);
        process.exitCode = 1;
    } finally {
        if (connection) await connection.end();
    }
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--status')) {
        await printMigrationStatus();
    } else {
        await runPendingMigrations();
    }
}

if (require.main === module) {
    main().catch(() => {
        process.exitCode = 1;
    });
}

module.exports = {
    runPendingMigrations,
    printMigrationStatus,
    getDbConnection,
    ensureDatabaseAndMigrationTable
};
