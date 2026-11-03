const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const validator = require('../src/middlewares/validator');

function createMockReqRes(body) {
    const req = { body };
    let responseStatus = 200;
    let responseBody = null;
    let nextCalled = false;

    const res = {
        status(code) {
            responseStatus = code;
            return this;
        },
        json(data) {
            responseBody = data;
            return this;
        }
    };

    const next = () => {
        nextCalled = true;
    };

    return { req, res, getStatus: () => responseStatus, getBody: () => responseBody, isNextCalled: () => nextCalled };
}

describe('Middleware Input Validator Tests', () => {
    describe('1. validateProduct', () => {
        test('Berhasil validasi input produk yang lengkap & valid', () => {
            const { req, res, isNextCalled } = createMockReqRes({
                product_id: 'PRD-TEST-01',
                product_name: 'Pakan Ayam Broiler',
                category: 'Pakan Ternak',
                unit: 'Sak',
                min_stock: '15'
            });

            validator.validateProduct(req, res, () => {});
            assert.strictEqual(req.validatedBody.product_id, 'PRD-TEST-01');
            assert.strictEqual(req.validatedBody.min_stock, 15);
        });

        test('Gagal jika product_id kosong', () => {
            const { req, res, getStatus, getBody } = createMockReqRes({
                product_id: '',
                product_name: 'Pakan',
                category: 'Pakan',
                unit: 'Sak'
            });

            validator.validateProduct(req, res, () => {});
            assert.strictEqual(getStatus(), 400);
            assert.strictEqual(getBody().status, 'Error');
        });

        test('Gagal jika min_stock negatif', () => {
            const { req, res, getStatus } = createMockReqRes({
                product_id: 'PRD-01',
                product_name: 'Pakan',
                category: 'Pakan',
                unit: 'Sak',
                min_stock: -5
            });

            validator.validateProduct(req, res, () => {});
            assert.strictEqual(getStatus(), 400);
        });
    });

    describe('2. validateStockIn', () => {
        test('Berhasil validasi input stock in yang valid', () => {
            const { req, res } = createMockReqRes({
                product_id: 'PRD-01',
                quantity: '50',
                expired_date: '2026-12-31'
            });

            validator.validateStockIn(req, res, () => {});
            assert.strictEqual(req.validatedBody.quantity, 50);
            assert.strictEqual(req.validatedBody.expired_date, '2026-12-31');
        });

        test('Gagal jika quantity tidak bulat positif (misal: 0 atau negatif)', () => {
            const { req, res, getStatus } = createMockReqRes({
                product_id: 'PRD-01',
                quantity: '0',
                expired_date: '2026-12-31'
            });

            validator.validateStockIn(req, res, () => {});
            assert.strictEqual(getStatus(), 400);
        });

        test('Gagal jika format tanggal kadaluwarsa bukan YYYY-MM-DD', () => {
            const { req, res, getStatus } = createMockReqRes({
                product_id: 'PRD-01',
                quantity: 10,
                expired_date: '31/12/2026'
            });

            validator.validateStockIn(req, res, () => {});
            assert.strictEqual(getStatus(), 400);
        });
    });

    describe('3. validateStockOut', () => {
        test('Berhasil validasi input stock out yang valid', () => {
            const { req, res } = createMockReqRes({
                product_id: 'PRD-01',
                quantity: 25,
                notes: 'Penjualan retail'
            });

            validator.validateStockOut(req, res, () => {});
            assert.strictEqual(req.validatedBody.quantity, 25);
            assert.strictEqual(req.validatedBody.notes, 'Penjualan retail');
        });

        test('Gagal jika quantity bukan angka atau <= 0', () => {
            const { req, res, getStatus } = createMockReqRes({
                product_id: 'PRD-01',
                quantity: 'invalid-number'
            });

            validator.validateStockOut(req, res, () => {});
            assert.strictEqual(getStatus(), 400);
        });
    });

    describe('4. validateStockDisposal', () => {
        test('Berhasil validasi pembuangan barang dengan alasan jelas', () => {
            const { req, res } = createMockReqRes({
                product_id: 'PRD-01',
                quantity: 5,
                reason: 'Kemasan rusak digigit hama saat penyimpanan'
            });

            validator.validateStockDisposal(req, res, () => {});
            assert.strictEqual(req.validatedBody.quantity, 5);
            assert.strictEqual(req.validatedBody.reason.length > 5, true);
        });

        test('Gagal jika alasan pembuangan kosong atau terlalu pendek', () => {
            const { req, res, getStatus } = createMockReqRes({
                product_id: 'PRD-01',
                quantity: 5,
                reason: 'ok'
            });

            validator.validateStockDisposal(req, res, () => {});
            assert.strictEqual(getStatus(), 400);
        });
    });

    describe('5. validateStockOpname', () => {
        test('Berhasil validasi input stock opname', () => {
            const { req, res } = createMockReqRes({
                product_id: 'PRD-01',
                physical_stock: 45,
                reason: 'Audit fisik mingguan tim gudang'
            });

            validator.validateStockOpname(req, res, () => {});
            assert.strictEqual(req.validatedBody.physical_stock, 45);
        });

        test('Gagal jika physical_stock negatif', () => {
            const { req, res, getStatus } = createMockReqRes({
                product_id: 'PRD-01',
                physical_stock: -1,
                reason: 'Audit mingguan'
            });

            validator.validateStockOpname(req, res, () => {});
            assert.strictEqual(getStatus(), 400);
        });
    });
});
