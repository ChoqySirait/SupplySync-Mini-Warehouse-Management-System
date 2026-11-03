/**
 * SupplySync WMS - RFC 4180 Compliant CSV Parser & Serializer
 * Murni JavaScript tanpa dependensi eksternal.
 * Mendukung field dengan koma, tanda kutip ganda ter-escape (""), spasi, dan newline.
 */

/**
 * Parsing string CSV mentah menjadi array baris (array of arrays)
 * @param {string} text teks CSV
 * @param {string} delimiter pemisah kolom (default ',')
 * @returns {Array<Array<string>>}
 */
function parseCsvRows(text, delimiter = ',') {
    if (!text || typeof text !== 'string') return [];

    const rows = [];
    let currentRow = [];
    let currentField = '';
    let insideQuotes = false;
    let i = 0;

    // Normalisasi baris baru CRLF -> LF
    const str = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    while (i < str.length) {
        const char = str[i];
        const nextChar = str[i + 1];

        if (insideQuotes) {
            if (char === '"') {
                if (nextChar === '"') {
                    // Escaped quote: "" -> "
                    currentField += '"';
                    i += 2;
                    continue;
                } else {
                    // Penutup kutip
                    insideQuotes = false;
                    i++;
                    continue;
                }
            } else {
                currentField += char;
                i++;
                continue;
            }
        } else {
            if (char === '"') {
                insideQuotes = true;
                i++;
                continue;
            } else if (char === delimiter) {
                currentRow.push(currentField.trim());
                currentField = '';
                i++;
                continue;
            } else if (char === '\n') {
                currentRow.push(currentField.trim());
                // Abaikan baris kosong
                if (currentRow.some(field => field.length > 0)) {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
                i++;
                continue;
            } else {
                currentField += char;
                i++;
                continue;
            }
        }
    }

    // Tangani sisa field terakhir
    if (currentField.length > 0 || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(field => field.length > 0)) {
            rows.push(currentRow);
        }
    }

    return rows;
}

/**
 * Parsing CSV menjadi Array of Objects berdasarkan baris header
 * @param {string} text teks CSV
 * @param {object} options
 * @returns {Array<object>}
 */
function parseCsvToObjects(text, options = {}) {
    const delimiter = options.delimiter || ',';
    const rows = parseCsvRows(text, delimiter);
    if (rows.length === 0) return [];

    // Header baris pertama dinormalisasi ke lowercase snake_case
    const rawHeaders = rows[0];
    const headers = rawHeaders.map(h => 
        h.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '')
    );

    const result = [];
    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const obj = {};
        let hasData = false;

        for (let c = 0; c < headers.length; c++) {
            const key = headers[c] || `col_${c}`;
            const val = row[c] !== undefined ? row[c] : '';
            obj[key] = val;
            if (val.length > 0) hasData = true;
        }

        if (hasData) {
            result.push(obj);
        }
    }

    return result;
}

/**
 * Serialisasi data objek ke teks format CSV
 * @param {Array<object>} items data
 * @param {Array<string>} columns kolom yang disertakan
 * @returns {string} CSV string
 */
function serializeToCsv(items, columns) {
    if (!Array.isArray(items) || items.length === 0) return '';
    const cols = columns || Object.keys(items[0]);

    const escapeCsvField = (field) => {
        const str = field === null || field === undefined ? '' : String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const lines = [];
    lines.push(cols.map(escapeCsvField).join(','));

    for (const item of items) {
        const row = cols.map(c => escapeCsvField(item[c]));
        lines.push(row.join(','));
    }

    return lines.join('\n');
}

module.exports = {
    parseCsvRows,
    parseCsvToObjects,
    serializeToCsv
};
