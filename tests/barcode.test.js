const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { generateBarcodeSvg, CODE39_PATTERNS } = require('../public/js/barcode');

describe('Code 39 SVG Barcode & Thermal Label Generator Tests', () => {
    test('1. Pola encoding Code 39 standar lengkap terdefinisi', () => {
        // Karakter krusial: angka, alfabet, hyphen, spasi, asterisk
        assert.ok(CODE39_PATTERNS['0']);
        assert.ok(CODE39_PATTERNS['A']);
        assert.ok(CODE39_PATTERNS['Z']);
        assert.ok(CODE39_PATTERNS['-']);
        assert.ok(CODE39_PATTERNS['*']);
        // Setiap pola harus memiliki 9 baris/spasi
        assert.strictEqual(CODE39_PATTERNS['A'].length, 9);
    });

    test('2. Menghasilkan elemen valid <svg> dengan <rect> untuk SKU produk', () => {
        const svg = generateBarcodeSvg('PRD-FEED-01');
        assert.ok(typeof svg === 'string');
        assert.ok(svg.includes('<svg'));
        assert.ok(svg.includes('</svg>'));
        assert.ok(svg.includes('<rect'));
        assert.ok(svg.includes('PRD-FEED-01'));
    });

    test('3. Menghasilkan barcode untuk kode lokasi rak gudang (Bin Location)', () => {
        const svg = generateBarcodeSvg('A-01-01', { height: 40, showText: false });
        assert.ok(svg.includes('<svg'));
        assert.ok(svg.includes('</svg>'));
        // Ketika showText: false, tidak ada tag <text>
        assert.ok(!svg.includes('<text'));
    });

    test('4. Sanitasi karakter ilegal dalam string barcode', () => {
        // Karakter ilegal di luar Code 39 (seperti <script> atau karakter unicode) otomatis di-sanitize ke hyphen
        const svg = generateBarcodeSvg('SKU<TEST>99');
        assert.ok(!svg.includes('<TEST>'));
        assert.ok(svg.includes('SKU-TEST-99'));
    });

    test('5. Penyesuaian opsi kustomisasi tinggi dan warna barcode', () => {
        const svg = generateBarcodeSvg('BATCH-2026', { height: 80, color: '#1e3a8a' });
        assert.ok(svg.includes('height="80"'));
        assert.ok(svg.includes('fill="#1e3a8a"'));
    });
});
