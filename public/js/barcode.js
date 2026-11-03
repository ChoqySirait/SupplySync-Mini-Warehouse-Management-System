/**
 * SupplySync WMS - Lightweight SVG Barcode (Code 128 / Code 39) & Thermal Label Generator
 * Murni JavaScript tanpa dependensi eksternal, menghasilkan vektor SVG resolusi tinggi siap cetak.
 */

// Encoding pola baris Code 39 standar (1 = bar tebal, 0 = bar tipis)
const escapeHtmlSafe = (str) => {
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
};

const CODE39_PATTERNS = {
    '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
    '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
    '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
    'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
    'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
    'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
    'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
    'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
    'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
    '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
    '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100'
};

/**
 * Generate string SVG Barcode Code 39
 * @param {string} text teks alfanumerik untuk barcode
 * @param {object} options tinggi, lebar bar, warna
 * @returns {string} SVG HTML element
 */
function generateBarcodeSvg(text, options = {}) {
    const rawText = String(text || '').toUpperCase().replace(/[^0-9A-Z\-\. \$\/\+\%]/g, '-');
    const fullText = `*${rawText}*`; // Code 39 memerlukan delimiter * di awal dan akhir
    
    const height = options.height || 50;
    const narrowWidth = options.narrowWidth || 2;
    const wideWidth = options.wideWidth || 5;
    const barColor = options.color || '#0f172a';

    let currentX = 10;
    const rects = [];

    for (let i = 0; i < fullText.length; i++) {
        const char = fullText[i];
        const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS['-'];

        for (let j = 0; j < 9; j++) {
            const isBar = j % 2 === 0;
            const isWide = pattern[j] === '1';
            const width = isWide ? wideWidth : narrowWidth;

            if (isBar) {
                rects.push(`<rect x="${currentX}" y="0" width="${width}" height="${height}" fill="${barColor}" />`);
            }
            currentX += width;
        }
        currentX += narrowWidth; // Spasi antar karakter
    }

    const totalWidth = currentX + 10;
    const showText = options.showText !== false;
    const totalSvgHeight = showText ? height + 18 : height;

    const textSvg = showText
        ? `<text x="${totalWidth / 2}" y="${height + 14}" text-anchor="middle" font-family="monospace" font-size="11" font-weight="bold" fill="${barColor}">${escapeHtmlSafe(rawText)}</text>`
        : '';

    return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalSvgHeight}" width="100%" height="${totalSvgHeight}" class="select-none">
            <rect width="100%" height="100%" fill="#ffffff" />
            ${rects.join('')}
            ${textSvg}
        </svg>
    `;
}

/**
 * Buka jendela cetak label stiker rak gudang (Bin Location Sticker 100x50mm)
 */
function printWarehouseBinLabel(locationCode, zoneName, aisle, rack, tier, bin) {
    const barcodeSvg = generateBarcodeSvg(locationCode, { height: 45, showText: false });

    const printWindow = window.open('', '_blank', 'width=600,height=450');
    if (!printWindow) {
        alert('Gagal membuka pop-up pencetakan. Izinkan pop-up peramban.');
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Label Rak Gudang - ${escapeHtmlSafe(locationCode)}</title>
            <style>
                @page { size: 100mm 60mm; margin: 4mm; }
                body {
                    font-family: 'Courier New', monospace, sans-serif;
                    margin: 0;
                    padding: 8px;
                    color: #000;
                    box-sizing: border-box;
                }
                .label-card {
                    border: 2px dashed #000;
                    padding: 8px;
                    border-radius: 6px;
                    text-align: center;
                }
                .brand { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; }
                .bin-code { font-size: 26px; font-weight: 900; margin: 4px 0; letter-spacing: 3px; }
                .zone-name { font-size: 11px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 6px; }
                .coords { font-size: 10px; margin-top: 6px; font-weight: bold; }
                .barcode-wrap { margin: 6px 0; }
            </style>
        </head>
        <body onload="window.print()">
            <div class="label-card">
                <div class="brand">SupplySync Enterprise WMS &bull; Location Tag</div>
                <div class="bin-code">${escapeHtmlSafe(locationCode)}</div>
                <div class="zone-name">${escapeHtmlSafe(zoneName)}</div>
                <div class="barcode-wrap">${barcodeSvg}</div>
                <div class="coords">Koordinat: ${escapeHtmlSafe(aisle)} | ${escapeHtmlSafe(rack)} | ${escapeHtmlSafe(tier)} | ${escapeHtmlSafe(bin)}</div>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
}

/**
 * Buka jendela cetak label stiker produk SKU
 */
function printProductSkuLabel(productId, productName, category, unit) {
    const barcodeSvg = generateBarcodeSvg(productId, { height: 40, showText: true });

    const printWindow = window.open('', '_blank', 'width=600,height=400');
    if (!printWindow) {
        alert('Gagal membuka pop-up pencetakan. Izinkan pop-up peramban.');
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Label SKU - ${escapeHtmlSafe(productId)}</title>
            <style>
                @page { size: 80mm 50mm; margin: 4mm; }
                body {
                    font-family: sans-serif;
                    margin: 0;
                    padding: 6px;
                    color: #000;
                }
                .label-box {
                    border: 2px solid #000;
                    padding: 6px;
                    border-radius: 6px;
                    text-align: center;
                }
                .sku { font-size: 18px; font-weight: bold; font-family: monospace; }
                .pname { font-size: 12px; font-weight: bold; margin: 3px 0; }
                .cat { font-size: 9px; color: #444; }
                .barcode { margin: 5px 0; }
            </style>
        </head>
        <body onload="window.print()">
            <div class="label-box">
                <div class="sku">${escapeHtmlSafe(productId)}</div>
                <div class="pname">${escapeHtmlSafe(productName)}</div>
                <div class="cat">Kategori: ${escapeHtmlSafe(category)} &bull; Satuan: ${escapeHtmlSafe(unit)}</div>
                <div class="barcode">${barcodeSvg}</div>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateBarcodeSvg,
        CODE39_PATTERNS,
        escapeHtmlSafe
    };
}
