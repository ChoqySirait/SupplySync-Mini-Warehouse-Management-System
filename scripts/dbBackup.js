#!/usr/bin/env node
const backupService = require('../src/utils/backupService');
const db = require('../src/config/database');

async function main() {
    const args = process.argv.slice(2);
    const isVerify = args.includes('--verify');
    const isBackup = args.includes('--backup') || (!isVerify && args.length === 0);

    console.log('====================================================================');
    console.log('   SUPPLYSYNC WMS - UTILITY CADANGAN & INTEGRITAS DATABASE');
    console.log('====================================================================');

    try {
        if (isVerify) {
            console.log('\n🔍 Memulai Pemeriksaan Integritas Referensial & Konsistensi Stok...');
            const result = await backupService.verifyDataIntegrity(db);

            console.log('\n📊 HASIL AUDIT INTEGRITAS DATA WMS:');
            console.log(`   - Status Kesehatan : [${result.status}]`);
            console.log(`   - Skor Integritas  : ${result.score}%`);
            console.log(`   - Masalah Kritis   : ${result.summary.critical_issues}`);
            console.log(`   - Peringatan       : ${result.summary.warnings}`);

            if (result.database_stats) {
                console.log('\n📦 STATISTIK ENTITAS GUDANG:');
                console.log(`   - Total Produk Master : ${result.database_stats.total_products}`);
                console.log(`   - Total Batch Aktif   : ${result.database_stats.total_batches}`);
                console.log(`   - Total Transaksi     : ${result.database_stats.total_transactions}`);
                console.log(`   - Total Item Mutasi   : ${result.database_stats.total_transaction_items}`);
            }

            if (result.anomalies.stock_discrepancies.length > 0) {
                console.log('\n⚠️ INKONSISTENSI SALDO STOK DITEMUKAN:');
                result.anomalies.stock_discrepancies.forEach(d => {
                    console.log(`   * SKU: ${d.product_id} (${d.product_name}) -> Master Stock: ${d.master_stock}, Batch Sum: ${d.batch_sum}, Selisih: ${d.discrepancy}`);
                });
            }

            if (result.anomalies.expired_active_batches.length > 0) {
                console.log('\n⏳ BATCH KEDALUWARSA DENGAN STOK AKTIF:');
                result.anomalies.expired_active_batches.forEach(b => {
                    console.log(`   * Batch ID: ${b.batch_id} (${b.batch_code}) -> SKU: ${b.product_id}, Qty: ${b.quantity}, Exp: ${b.expired_date}`);
                });
            }

            if (result.summary.critical_issues > 0) {
                console.error('\n❌ Integritas data memiliki masalah kritis! Segera lakukan rekonsiliasi stok opname.');
                process.exitCode = 1;
            } else {
                console.log('\n✅ Seluruh pemeriksaan integritas referensial data stok berada dalam kondisi aman.');
            }
        }

        if (isBackup) {
            console.log('\n💾 Memulai Proses Pencadangan Snapshot Database WMS...');
            const backup = await backupService.createDatabaseBackup({ pool: db });

            console.log('\n✅ PENCADANGAN DATABASE BERHASIL SELESAI!');
            console.log(`   - Berkas JSON Snapshot : ${backup.filename}`);
            console.log(`   - Lokasi Penyimpanan   : ${backup.filepath}`);
            if (backup.sql_filepath) {
                console.log(`   - Berkas SQL Dump      : ${backup.sql_filepath}`);
            }
            console.log(`   - Ukuran Berkas        : ${backup.size_kb} KB (${backup.size_bytes} bytes)`);
            console.log(`   - Total Tabel          : ${backup.tables_count}`);
            console.log(`   - Total Record         : ${backup.total_records}`);
        }

    } catch (error) {
        console.error('\n❌ Terjadi kegagalan saat menjalankan utilitas:', error.message);
        process.exitCode = 1;
    } finally {
        // Tutup koneksi pool
        try {
            await db.end();
        } catch (_) {}
    }
}

if (require.main === module) {
    main();
}

module.exports = main;
