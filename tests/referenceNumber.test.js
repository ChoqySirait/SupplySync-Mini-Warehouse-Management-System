const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { generateReferenceNumber } = require('../src/services/inventoryService');

describe('WMS Reference Number Generator Tests', () => {
    test('Format nomor referensi IN sesuai standar (TRX-IN-YYYYMMDD-XXXX)', () => {
        const refNo = generateReferenceNumber('IN');
        assert.match(refNo, /^TRX-IN-\d{8}-\d{4}$/);
    });

    test('Format nomor referensi OUT sesuai standar (TRX-OUT-YYYYMMDD-XXXX)', () => {
        const refNo = generateReferenceNumber('OUT');
        assert.match(refNo, /^TRX-OUT-\d{8}-\d{4}$/);
    });

    test('Format nomor referensi DISPOSAL sesuai standar (TRX-DISP-YYYYMMDD-XXXX)', () => {
        const refNo = generateReferenceNumber('DISP');
        assert.match(refNo, /^TRX-DISP-\d{8}-\d{4}$/);
    });

    test('Nomor referensi acak dan unik pada panggilan berurutan', () => {
        const ref1 = generateReferenceNumber('IN');
        const ref2 = generateReferenceNumber('IN');
        assert.notStrictEqual(ref1, ref2);
    });
});
