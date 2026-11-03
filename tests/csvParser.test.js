const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { parseCsvRows, parseCsvToObjects, serializeToCsv } = require('../src/utils/csvParser');

describe('RFC 4180 CSV Parser & Serializer Tests', () => {
    test('1. Parsing CSV sederhana berbasis baris dan kolom', () => {
        const csv = "SKU,Nama Produk,Stok\nPRD-01,Beras Super,50\nPRD-02,Minyak Goreng,30";
        const rows = parseCsvRows(csv);
        assert.strictEqual(rows.length, 3);
        assert.deepStrictEqual(rows[0], ['SKU', 'Nama Produk', 'Stok']);
        assert.deepStrictEqual(rows[1], ['PRD-01', 'Beras Super', '50']);
        assert.deepStrictEqual(rows[2], ['PRD-02', 'Minyak Goreng', '30']);
    });

    test('2. Menangani nilai berkoma dan tanda kutip ganda ter-escape ("")', () => {
        const csv = `SKU,Deskripsi,Kategori\nPRD-03,"Tepung Terigu, Protein Tinggi",Bahan Kue\nPRD-04,"Karton ""Komersial"" Ukuran A",Kemasan`;
        const objects = parseCsvToObjects(csv);
        assert.strictEqual(objects.length, 2);
        assert.strictEqual(objects[0].sku, 'PRD-03');
        assert.strictEqual(objects[0].deskripsi, 'Tepung Terigu, Protein Tinggi');
        assert.strictEqual(objects[1].sku, 'PRD-04');
        assert.strictEqual(objects[1].deskripsi, 'Karton "Komersial" Ukuran A');
    });

    test('3. Menangani baris kosong dan variasi line break CRLF Windows / LF Linux', () => {
        const csv = "sku,qty\r\nPRD-01,10\r\n\r\nPRD-02,20\r\n";
        const objects = parseCsvToObjects(csv);
        assert.strictEqual(objects.length, 2);
        assert.strictEqual(objects[0].sku, 'PRD-01');
        assert.strictEqual(objects[1].sku, 'PRD-02');
    });

    test('4. Serialisasi data objek menjadi teks CSV yang valid', () => {
        const data = [
            { id: 'PRD-01', name: 'Gula Pasir, Premium', price: 15000 },
            { id: 'PRD-02', name: 'Garam Dapur', price: 5000 }
        ];

        const csvString = serializeToCsv(data, ['id', 'name', 'price']);
        assert.ok(csvString.includes('"Gula Pasir, Premium"'));
        assert.ok(csvString.includes('Garam Dapur'));
        assert.ok(csvString.startsWith('id,name,price'));
    });

    test('5. Penanganan input kosong atau tidak valid dengan aman', () => {
        assert.deepStrictEqual(parseCsvRows(''), []);
        assert.deepStrictEqual(parseCsvRows(null), []);
        assert.deepStrictEqual(parseCsvToObjects(''), []);
        assert.strictEqual(serializeToCsv([]), '');
    });
});
