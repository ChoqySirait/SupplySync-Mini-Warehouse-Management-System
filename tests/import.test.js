const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { parseCsvToObjects } = require('../src/utils/csvParser');

describe('WMS Bulk CSV Import Business Logic Tests', () => {
    test('1. Validasi format CSV master SKU produk dengan fleksibilitas nama kolom', () => {
        const rawCsv = `sku,nama_produk,kategori,satuan,safety_stock,hpp,deskripsi
PRD-BULK-01,Tepung Terigu 1Kg,Bahan Pokok,Sak,20,12000,Kemasan tebal
PRD-BULK-02,Gula Kristal Putih 50Kg,Bahan Pokok,Karton,15,450000,Standar SNI`;

        const parsed = parseCsvToObjects(rawCsv);
        assert.strictEqual(parsed.length, 2);

        const row1 = parsed[0];
        assert.strictEqual(row1.sku, 'PRD-BULK-01');
        assert.strictEqual(row1.nama_produk, 'Tepung Terigu 1Kg');
        assert.strictEqual(row1.kategori, 'Bahan Pokok');
        assert.strictEqual(parseInt(row1.safety_stock, 10), 20);
        assert.strictEqual(parseFloat(row1.hpp), 12000);
    });

    test('2. Validasi format CSV manifest penerimaan batch (Inbound Manifest)', () => {
        const manifestCsv = `sku,qty,expired_date,batch_code,location_code,supplier_code,notes
PRD-FEED-01,50,2026-12-31,BTC-MAN-001,A-01-01,SUP-CJ-01,Penerimaan kontainer 1
PRD-OIL-01,25,2027-01-15,BTC-MAN-002,B-01-01,SUP-WIL-02,Pallet A3`;

        const parsed = parseCsvToObjects(manifestCsv);
        assert.strictEqual(parsed.length, 2);

        const item2 = parsed[1];
        assert.strictEqual(item2.sku, 'PRD-OIL-01');
        assert.strictEqual(parseInt(item2.qty, 10), 25);
        assert.strictEqual(item2.expired_date, '2027-01-15');
        assert.strictEqual(item2.location_code, 'B-01-01');
        assert.strictEqual(item2.supplier_code, 'SUP-WIL-02');
    });

    test('3. Deteksi baris tidak valid pada manifest penerimaan barang', () => {
        const badCsv = `sku,qty,expired_date\nPRD-01,-10,invalid-date\n,50,2026-10-10`;
        const rows = parseCsvToObjects(badCsv);
        assert.strictEqual(rows.length, 2);

        // Baris 1: kuantitas negatif
        const qty1 = parseInt(rows[0].qty, 10);
        assert.ok(qty1 <= 0, 'Kuantitas negatif terdeteksi tidak valid');

        // Baris 2: SKU kosong
        const sku2 = rows[1].sku;
        assert.strictEqual(sku2, '', 'SKU kosong terdeteksi');
    });

    test('4. Penanganan nilai kolom dengan spasi ekstra dan format tanggal', () => {
        const dirtyCsv = `sku,expired_date\n  PRD-SPACED-01  ,  2026-11-20  `;
        const rows = parseCsvToObjects(dirtyCsv);
        assert.strictEqual(rows[0].sku, 'PRD-SPACED-01');
        assert.strictEqual(rows[0].expired_date, '2026-11-20');
    });
});
