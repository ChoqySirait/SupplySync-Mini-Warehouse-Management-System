const fs = require('fs');
const path = require('path');
const db = require('../config/database');

/**
 * SupplySync WMS - Automated Database Backup, Integrity & Recovery Service
 * Menjamin integritas referensial data, kepatuhan audit, dan pemulihan bencana.
 */

// Daftar tabel WMS terurut sesuai hierarki Foreign Key (Aman untuk Backup & Restore)
const WMS_TABLES = [
    'warehouse_facilities',
    'users',
    'categories',
    'suppliers',
    'warehouse_locations',
    'products',
    'inventory_batches',
    'stock_transactions',
    'stock_transaction_items',
    'stock_transfers',
    'stock_transfer_items',
    'stock_opname',
    'purchase_orders',
    'purchase_order_items',
    'sales_orders',
    'sales_order_items'
];

const DEFAULT_BACKUP_DIR = path.resolve(process.cwd(), 'backups');

/**
 * Pastikan direktori backup tersedia
 */
function ensureBackupDir(dirPath = DEFAULT_BACKUP_DIR) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    return dirPath;
}

/**
 * 1. Murni In-Memory Evaluasi Integritas Data WMS (Bebas dependensi I/O untuk Unit Testing & Sanitasi)
 * @param {object} datasets { products, batches, transactions, transactionItems }
 * @returns {object} status, score, dan rincian anomali
 */
function evaluateIntegrity(datasets = {}) {
    const products = datasets.products || [];
    const batches = datasets.batches || [];
    const transactions = datasets.transactions || [];
    const transactionItems = datasets.transactionItems || [];
    const todayStr = (datasets.currentDate || new Date()).toISOString().split('T')[0];

    const anomalies = {
        stock_discrepancies: [],
        negative_quantities: [],
        orphaned_batches: [],
        orphaned_transaction_items: [],
        expired_active_batches: [],
        unassigned_locations: []
    };

    // A. Indeks Produk untuk cek referensial cepat
    const productMap = new Map();
    products.forEach(p => {
        const hasLegacyStockProp = p.stock !== undefined && p.stock !== null;
        productMap.set(p.product_id, {
            ...p,
            stock: hasLegacyStockProp ? Number(p.stock) : undefined,
            min_stock: Number(p.min_stock) || 0
        });

        // Cek nilai negatif
        if ((hasLegacyStockProp && Number(p.stock) < 0) || (Number(p.min_stock) || 0) < 0) {
            anomalies.negative_quantities.push({
                type: 'PRODUCT_NEGATIVE_VALUE',
                product_id: p.product_id,
                stock: p.stock,
                min_stock: p.min_stock
            });
        }
    });

    // B. Hitung agregasi stok per batch & periksa keabsahan batch
    const batchStockSum = new Map();
    const batchMap = new Map();

    batches.forEach(b => {
        batchMap.set(b.batch_id, b);
        const qty = Number(b.quantity) || 0;

        // Cek batch quantity negatif
        if (qty < 0) {
            anomalies.negative_quantities.push({
                type: 'BATCH_NEGATIVE_QUANTITY',
                batch_id: b.batch_id,
                product_id: b.product_id,
                quantity: qty
            });
        }

        // Cek orphaned batch (produk tidak ada)
        if (!productMap.has(b.product_id)) {
            anomalies.orphaned_batches.push({
                batch_id: b.batch_id,
                product_id: b.product_id,
                quantity: qty
            });
        } else {
            const currentSum = batchStockSum.get(b.product_id) || 0;
            batchStockSum.set(b.product_id, currentSum + qty);
        }

        // Cek batch kedaluwarsa yang masih aktif stoknya
        if (qty > 0 && b.expired_date) {
            const expStr = typeof b.expired_date === 'string' 
                ? b.expired_date.split('T')[0] 
                : b.expired_date.toISOString().split('T')[0];
            if (expStr < todayStr) {
                anomalies.expired_active_batches.push({
                    batch_id: b.batch_id,
                    batch_code: b.batch_code || `BATCH-${b.batch_id}`,
                    product_id: b.product_id,
                    quantity: qty,
                    expired_date: expStr
                });
            }
        }

        // Cek batch tanpa lokasi rak
        if (qty > 0 && (b.location_id === null || b.location_id === undefined || b.location_id === '')) {
            anomalies.unassigned_locations.push({
                batch_id: b.batch_id,
                product_id: b.product_id,
                quantity: qty
            });
        }
    });

    // C. Cek inkonsistensi saldo stok jika master produk menyertakan target stock (untuk kompatibilitas testing)
    products.forEach(p => {
        if (p.stock !== undefined && p.stock !== null) {
            const masterStock = Number(p.stock) || 0;
            const actualBatchSum = batchStockSum.get(p.product_id) || 0;
            if (masterStock !== actualBatchSum) {
                anomalies.stock_discrepancies.push({
                    product_id: p.product_id,
                    product_name: p.product_name,
                    master_stock: masterStock,
                    batch_sum: actualBatchSum,
                    discrepancy: masterStock - actualBatchSum
                });
            }
        }
    });

    // D. Cek orphaned transaction items
    const trxMap = new Map();
    transactions.forEach(t => trxMap.set(t.transaction_id, t));

    transactionItems.forEach(item => {
        const hasTrx = trxMap.has(item.transaction_id);
        const hasBatch = batchMap.has(item.batch_id);

        if (!hasTrx || !hasBatch) {
            anomalies.orphaned_transaction_items.push({
                item_id: item.item_id,
                transaction_id: item.transaction_id,
                batch_id: item.batch_id,
                reason: !hasTrx ? 'TRANSACTION_NOT_FOUND' : 'BATCH_NOT_FOUND'
            });
        }
    });

    // Hitung Skor Integritas & Status
    const criticalCount = 
        anomalies.stock_discrepancies.length +
        anomalies.negative_quantities.length +
        anomalies.orphaned_batches.length +
        anomalies.orphaned_transaction_items.length;

    const warningCount = 
        anomalies.expired_active_batches.length +
        anomalies.unassigned_locations.length;

    let score = 100 - (criticalCount * 25) - (warningCount * 5);
    if (score < 0) score = 0;

    let status = 'HEALTHY';
    if (criticalCount > 0) {
        status = 'CRITICAL';
    } else if (warningCount > 0) {
        status = 'WARNING';
    }

    return {
        status,
        score,
        timestamp: new Date().toISOString(),
        summary: {
            total_checks: 6,
            critical_issues: criticalCount,
            warnings: warningCount,
            is_healthy: status === 'HEALTHY'
        },
        anomalies
    };
}

/**
 * 2. Eksekusi Verifikasi Integritas Data dari Database MySQL
 * Menghitung stok nyata berbasis agregasi inventory_batches (Single Source of Truth)
 * @param {object} pool instance koneksi database (opsional)
 * @returns {Promise<object>}
 */
async function verifyDataIntegrity(pool = db) {
    try {
        const [products] = await pool.query('SELECT product_id, product_name, min_stock, cost_price FROM products');
        const [batches] = await pool.query('SELECT batch_id, batch_code, product_id, location_id, quantity, expired_date FROM inventory_batches');
        const [transactions] = await pool.query('SELECT transaction_id, reference_no, product_id, transaction_type, quantity FROM stock_transactions');
        const [transactionItems] = await pool.query('SELECT item_id, transaction_id, batch_id, quantity FROM stock_transaction_items');

        const result = evaluateIntegrity({
            products,
            batches,
            transactions,
            transactionItems
        });

        // Sertakan info jumlah entitas database
        result.database_stats = {
            total_products: products.length,
            total_batches: batches.length,
            total_transactions: transactions.length,
            total_transaction_items: transactionItems.length
        };

        return result;
    } catch (error) {
        console.error('❌ Error saat verifyDataIntegrity:', error.message);
        throw error;
    }
}

/**
 * 3. Buat Cadangan Database Otomatis (JSON Snapshot & SQL Dump)
 * @param {object} options
 * @returns {Promise<object>}
 */
async function createDatabaseBackup(options = {}) {
    const targetDir = options.targetDir || DEFAULT_BACKUP_DIR;
    const pool = options.pool || db;
    ensureBackupDir(targetDir);

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestampStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `supplysync_backup_${timestampStr}.json`;
    const filepath = path.join(targetDir, filename);

    const backupData = {
        metadata: {
            application: 'SupplySync Enterprise Warehouse Management System',
            version: '2.0.0',
            generated_at: now.toISOString(),
            tables_included: WMS_TABLES.length,
            total_records: 0
        },
        tables: {}
    };

    let totalRecords = 0;

    for (const table of WMS_TABLES) {
        try {
            const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
            backupData.tables[table] = rows || [];
            totalRecords += (rows ? rows.length : 0);
        } catch (err) {
            console.warn(`⚠️ Tabel '${table}' tidak dapat di-backup:`, err.message);
            backupData.tables[table] = [];
        }
    }

    backupData.metadata.total_records = totalRecords;

    // Simpan snapshot JSON ke file
    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2), 'utf8');
    const fileStats = fs.statSync(filepath);

    // Buat juga file SQL Dump pendamping (.sql) jika diminta
    let sqlFilepath = null;
    if (options.includeSql !== false) {
        const sqlFilename = `supplysync_backup_${timestampStr}.sql`;
        sqlFilepath = path.join(targetDir, sqlFilename);
        const sqlDump = generateSqlDump(backupData);
        fs.writeFileSync(sqlFilepath, sqlDump, 'utf8');
    }

    return {
        success: true,
        filename,
        filepath,
        sql_filepath: sqlFilepath,
        size_bytes: fileStats.size,
        size_kb: (fileStats.size / 1024).toFixed(2),
        total_records: totalRecords,
        tables_count: WMS_TABLES.length,
        created_at: now.toISOString()
    };
}

/**
 * Hasilkan SQL INSERT dump dari snapshot data
 * @param {object} backupData 
 * @returns {string}
 */
function generateSqlDump(backupData) {
    const lines = [
        '-- ====================================================================',
        '-- SUPPLYSYNC WMS - AUTOMATED DATABASE SNAPSHOT DUMP',
        `-- Generated At: ${backupData.metadata.generated_at}`,
        `-- App Version : ${backupData.metadata.version}`,
        '-- ====================================================================',
        'SET FOREIGN_KEY_CHECKS = 0;',
        ''
    ];

    for (const [table, rows] of Object.entries(backupData.tables)) {
        if (!rows || rows.length === 0) continue;

        lines.push(`-- Data for table: ${table} (${rows.length} records)`);
        const columns = Object.keys(rows[0]);
        const colsFormatted = columns.map(c => `\`${c}\``).join(', ');

        for (const row of rows) {
            const values = columns.map(c => {
                const val = row[c];
                if (val === null || val === undefined) return 'NULL';
                if (typeof val === 'number') return val;
                if (typeof val === 'boolean') return val ? 1 : 0;
                if (val instanceof Date) {
                    return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
                }
                const escaped = String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                return `'${escaped}'`;
            });
            lines.push(`INSERT INTO \`${table}\` (${colsFormatted}) VALUES (${values.join(', ')});`);
        }
        lines.push('');
    }

    lines.push('SET FOREIGN_KEY_CHECKS = 1;');
    lines.push('-- End of Snapshot Dump');
    return lines.join('\n');
}

/**
 * 4. Ambil Daftar Berkas Cadangan yang Tersimpan
 * @param {string} targetDir 
 * @returns {Array<object>}
 */
function listBackups(targetDir = DEFAULT_BACKUP_DIR) {
    ensureBackupDir(targetDir);
    const files = fs.readdirSync(targetDir);

    const backups = files
        .filter(f => f.startsWith('supplysync_backup_') && (f.endsWith('.json') || f.endsWith('.sql')))
        .map(filename => {
            const fullPath = path.join(targetDir, filename);
            const stats = fs.statSync(fullPath);
            return {
                filename,
                type: filename.endsWith('.json') ? 'JSON_SNAPSHOT' : 'SQL_DUMP',
                size_bytes: stats.size,
                size_kb: (stats.size / 1024).toFixed(2),
                created_at: stats.birthtime.toISOString(),
                modified_at: stats.mtime.toISOString()
            };
        })
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return backups;
}

/**
 * 5. Pulihkan Database dari Berkas Cadangan (Restore Procedure)
 * Mendukung pemulihan dari JSON Snapshot maupun SQL Dump.
 * @param {string} backupFilename nama file atau path absolut ke berkas backup
 * @param {object} options { pool, targetDir }
 * @returns {Promise<object>}
 */
async function restoreDatabaseFromBackup(backupFilename, options = {}) {
    const targetDir = options.targetDir || DEFAULT_BACKUP_DIR;
    const pool = options.pool || db;

    const fullPath = path.isAbsolute(backupFilename) 
        ? backupFilename 
        : path.join(targetDir, backupFilename);

    if (!fs.existsSync(fullPath)) {
        throw new Error(`Berkas cadangan '${backupFilename}' tidak ditemukan.`);
    }

    const isSql = fullPath.endsWith('.sql');
    const isJson = fullPath.endsWith('.json');

    if (!isSql && !isJson) {
        throw new Error('Format berkas cadangan tidak valid. Hanya mendukung .json dan .sql.');
    }

    console.log(`🔄 Memulai prosedur pemulihan basis data dari: ${path.basename(fullPath)}...`);

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.query('SET FOREIGN_KEY_CHECKS = 0;');

        let restoredTables = 0;
        let restoredRecords = 0;

        if (isJson) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const data = JSON.parse(content);

            if (!data.tables || typeof data.tables !== 'object') {
                throw new Error('Struktur berkas JSON snapshot tidak valid.');
            }

            // Bersihkan tabel sebelum memasukkan data restore
            for (const table of WMS_TABLES) {
                if (data.tables[table]) {
                    await connection.query(`TRUNCATE TABLE \`${table}\`;`);
                }
            }

            // Masukkan data per tabel
            for (const table of WMS_TABLES) {
                const rows = data.tables[table];
                if (!rows || rows.length === 0) continue;

                const columns = Object.keys(rows[0]);
                const colsFormatted = columns.map(c => `\`${c}\``).join(', ');
                const placeholders = columns.map(() => '?').join(', ');
                const insertSql = `INSERT INTO \`${table}\` (${colsFormatted}) VALUES (${placeholders})`;

                for (const row of rows) {
                    const values = columns.map(c => row[c]);
                    await connection.query(insertSql, values);
                    restoredRecords++;
                }

                restoredTables++;
            }
        } else if (isSql) {
            const sqlContent = fs.readFileSync(fullPath, 'utf8');
            await connection.query(sqlContent);
            restoredTables = WMS_TABLES.length;
        }

        await connection.query('SET FOREIGN_KEY_CHECKS = 1;');

        console.log(`✅ Pemulihan basis data selesai dengan sukses! (${restoredRecords} data dipulihkan)`);
        return {
            success: true,
            source_file: path.basename(fullPath),
            restored_tables: restoredTables,
            restored_records: restoredRecords,
            restored_at: new Date().toISOString()
        };

    } catch (error) {
        if (connection) {
            await connection.query('SET FOREIGN_KEY_CHECKS = 1;').catch(() => {});
        }
        console.error('❌ Gagal memulihkan database:', error.message);
        throw error;
    } finally {
        if (connection) connection.release();
    }
}

module.exports = {
    WMS_TABLES,
    DEFAULT_BACKUP_DIR,
    evaluateIntegrity,
    verifyDataIntegrity,
    createDatabaseBackup,
    generateSqlDump,
    listBackups,
    restoreDatabaseFromBackup
};
