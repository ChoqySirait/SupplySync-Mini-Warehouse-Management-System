const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    evaluateIntegrity,
    generateSqlDump,
    listBackups
} = require('../src/utils/backupService');

describe('Database Integrity Verification & Backup Utilities Tests', () => {
    const tempBackupDir = path.join(__dirname, 'temp_backups_test');

    before(() => {
        if (!fs.existsSync(tempBackupDir)) {
            fs.mkdirSync(tempBackupDir, { recursive: true });
        }
    });

    after(() => {
        if (fs.existsSync(tempBackupDir)) {
            fs.rmSync(tempBackupDir, { recursive: true, force: true });
        }
    });

    test('1. Evaluasi integritas data: Kondisi sempurna (HEALTHY, Skor 100%)', () => {
        const datasets = {
            currentDate: new Date('2026-11-03T00:00:00Z'),
            products: [
                { product_id: 'PRD-A', product_name: 'Barang A', stock: 50, min_stock: 10 },
                { product_id: 'PRD-B', product_name: 'Barang B', stock: 30, min_stock: 5 }
            ],
            batches: [
                { batch_id: 1, batch_code: 'B-01', product_id: 'PRD-A', location_id: 1, quantity: 30, expired_date: '2027-12-31' },
                { batch_id: 2, batch_code: 'B-02', product_id: 'PRD-A', location_id: 1, quantity: 20, expired_date: '2027-12-31' },
                { batch_id: 3, batch_code: 'B-03', product_id: 'PRD-B', location_id: 2, quantity: 30, expired_date: '2028-06-30' }
            ],
            transactions: [
                { transaction_id: 101, product_id: 'PRD-A', transaction_type: 'IN', quantity: 50 }
            ],
            transactionItems: [
                { item_id: 1, transaction_id: 101, batch_id: 1, quantity: 30 }
            ]
        };

        const result = evaluateIntegrity(datasets);
        assert.strictEqual(result.status, 'HEALTHY');
        assert.strictEqual(result.score, 100);
        assert.strictEqual(result.summary.critical_issues, 0);
        assert.strictEqual(result.summary.warnings, 0);
        assert.strictEqual(result.summary.is_healthy, true);
    });

    test('2. Deteksi inkonsistensi saldo stok (Master Stock vs Total Batch Sum)', () => {
        const datasets = {
            currentDate: new Date('2026-11-03T00:00:00Z'),
            products: [
                // Master mencatat 100, tapi batch hanya berjumlah 80
                { product_id: 'PRD-X', product_name: 'Barang X', stock: 100, min_stock: 10 }
            ],
            batches: [
                { batch_id: 10, batch_code: 'BX-01', product_id: 'PRD-X', location_id: 1, quantity: 80, expired_date: '2027-01-01' }
            ],
            transactions: [],
            transactionItems: []
        };

        const result = evaluateIntegrity(datasets);
        assert.strictEqual(result.status, 'CRITICAL');
        assert.strictEqual(result.anomalies.stock_discrepancies.length, 1);
        assert.strictEqual(result.anomalies.stock_discrepancies[0].product_id, 'PRD-X');
        assert.strictEqual(result.anomalies.stock_discrepancies[0].master_stock, 100);
        assert.strictEqual(result.anomalies.stock_discrepancies[0].batch_sum, 80);
        assert.strictEqual(result.anomalies.stock_discrepancies[0].discrepancy, 20);
        assert.ok(result.score <= 75);
    });

    test('3. Deteksi anomali kuantitas negatif pada produk dan batch', () => {
        const datasets = {
            currentDate: new Date('2026-11-03T00:00:00Z'),
            products: [
                { product_id: 'PRD-NEG', product_name: 'Barang Negatif', stock: -5, min_stock: 0 }
            ],
            batches: [
                { batch_id: 99, product_id: 'PRD-NEG', location_id: 1, quantity: -5, expired_date: '2027-01-01' }
            ],
            transactions: [],
            transactionItems: []
        };

        const result = evaluateIntegrity(datasets);
        assert.strictEqual(result.status, 'CRITICAL');
        assert.ok(result.anomalies.negative_quantities.length >= 2);
    });

    test('4. Deteksi batch yatim (Orphaned Batches) dan item mutasi yatim', () => {
        const datasets = {
            currentDate: new Date('2026-11-03T00:00:00Z'),
            products: [
                { product_id: 'PRD-VALID', product_name: 'Produk Valid', stock: 10, min_stock: 5 }
            ],
            batches: [
                { batch_id: 1, product_id: 'PRD-VALID', location_id: 1, quantity: 10, expired_date: '2027-01-01' },
                // Batch merujuk ke produk fiktif yang tidak ada di tabel products
                { batch_id: 2, product_id: 'PRD-GHOST', location_id: 1, quantity: 15, expired_date: '2027-01-01' }
            ],
            transactions: [
                { transaction_id: 50, product_id: 'PRD-VALID', transaction_type: 'IN', quantity: 10 }
            ],
            transactionItems: [
                // Item merujuk ke transaction_id yang tidak ada
                { item_id: 901, transaction_id: 9999, batch_id: 1, quantity: 5 },
                // Item merujuk ke batch_id yang tidak ada
                { item_id: 902, transaction_id: 50, batch_id: 8888, quantity: 5 }
            ]
        };

        const result = evaluateIntegrity(datasets);
        assert.strictEqual(result.status, 'CRITICAL');
        assert.strictEqual(result.anomalies.orphaned_batches.length, 1);
        assert.strictEqual(result.anomalies.orphaned_batches[0].product_id, 'PRD-GHOST');
        assert.strictEqual(result.anomalies.orphaned_transaction_items.length, 2);
    });

    test('5. Peringatan batch kedaluwarsa dengan stok aktif & batch tanpa lokasi rak', () => {
        const datasets = {
            currentDate: new Date('2026-11-03T00:00:00Z'),
            products: [
                { product_id: 'PRD-EXP', product_name: 'Produk Expired', stock: 15, min_stock: 0 }
            ],
            batches: [
                // Expired pada 2026-10-01 (sebelum currentDate 2026-11-03) dan location_id null
                { batch_id: 77, batch_code: 'EXP-77', product_id: 'PRD-EXP', location_id: null, quantity: 15, expired_date: '2026-10-01' }
            ],
            transactions: [],
            transactionItems: []
        };

        const result = evaluateIntegrity(datasets);
        assert.strictEqual(result.status, 'WARNING');
        assert.strictEqual(result.anomalies.expired_active_batches.length, 1);
        assert.strictEqual(result.anomalies.expired_active_batches[0].batch_id, 77);
        assert.strictEqual(result.anomalies.unassigned_locations.length, 1);
        assert.strictEqual(result.summary.critical_issues, 0);
        assert.strictEqual(result.summary.warnings, 2);
    });

    test('6. Pembangkitan SQL Dump Snapshot yang valid & aman escaping', () => {
        const mockBackup = {
            metadata: {
                generated_at: '2026-11-03T09:00:00.000Z',
                version: '1.1.0'
            },
            tables: {
                categories: [
                    { category_id: 1, category_name: "Makanan & Minuman 'Spesial'", description: 'Deskripsi kategori "A"' }
                ]
            }
        };

        const sql = generateSqlDump(mockBackup);
        assert.ok(sql.includes('INSERT INTO `categories`'));
        assert.ok(sql.includes("Makanan & Minuman \\'Spesial\\'"));
        assert.ok(sql.includes('SET FOREIGN_KEY_CHECKS = 0;'));
        assert.ok(sql.includes('SET FOREIGN_KEY_CHECKS = 1;'));
    });

    test('7. Pembacaan daftar backup dengan listBackups()', () => {
        // Buat file backup simulasi
        const file1 = path.join(tempBackupDir, 'supplysync_backup_20261103_080000.json');
        const file2 = path.join(tempBackupDir, 'supplysync_backup_20261103_090000.json');
        fs.writeFileSync(file1, '{"test": 1}', 'utf8');
        fs.writeFileSync(file2, '{"test": 2}', 'utf8');

        const backups = listBackups(tempBackupDir);
        assert.strictEqual(backups.length, 2);
        assert.ok(backups[0].filename.includes('supplysync_backup_'));
        assert.ok(backups[0].size_bytes > 0);
    });
});
