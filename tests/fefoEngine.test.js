const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { allocateFefoBatches } = require('../src/services/inventoryService');

describe('FEFO Engine Allocation Logic', () => {
    test('1. Alokasi sebagian stok dari batch tunggal (Partial Single Batch)', () => {
        const batches = [
            { batch_id: 1, batch_code: 'BTC-001', quantity: 50, expired_date: '2026-12-01', received_date: '2026-01-01' }
        ];

        const result = allocateFefoBatches(batches, 20);

        assert.strictEqual(result.fulfilled, true);
        assert.strictEqual(result.totalAllocated, 20);
        assert.strictEqual(result.allocations.length, 1);
        assert.strictEqual(result.allocations[0].batch_id, 1);
        assert.strictEqual(result.allocations[0].deducted, 20);
        assert.strictEqual(result.allocations[0].remaining, 30);
    });

    test('2. Alokasi tepat habis satu batch (Exact Match)', () => {
        const batches = [
            { batch_id: 1, batch_code: 'BTC-001', quantity: 25, expired_date: '2026-12-01', received_date: '2026-01-01' }
        ];

        const result = allocateFefoBatches(batches, 25);

        assert.strictEqual(result.fulfilled, true);
        assert.strictEqual(result.totalAllocated, 25);
        assert.strictEqual(result.allocations[0].deducted, 25);
        assert.strictEqual(result.allocations[0].remaining, 0);
    });

    test('3. Alokasi berantai melintasi beberapa batch (Multi-Batch Depletion FEFO)', () => {
        // Tiga batch dengan tanggal expired berbeda:
        // Batch 2 expired paling dekat (2026-06-01), lalu Batch 1 (2026-08-01), lalu Batch 3 (2026-12-01)
        const batches = [
            { batch_id: 1, batch_code: 'BTC-001', quantity: 30, expired_date: '2026-08-01', received_date: '2026-01-10' },
            { batch_id: 2, batch_code: 'BTC-002', quantity: 20, expired_date: '2026-06-01', received_date: '2026-01-05' },
            { batch_id: 3, batch_code: 'BTC-003', quantity: 50, expired_date: '2026-12-01', received_date: '2026-01-15' }
        ];

        // Minta 45 unit:
        // Harusnya potong habis Batch 2 (20 unit), sisa butuh 25.
        // Potong 25 dari Batch 1 (30 unit -> sisa 5 unit).
        // Batch 3 tidak tersentuh.
        const result = allocateFefoBatches(batches, 45);

        assert.strictEqual(result.fulfilled, true);
        assert.strictEqual(result.totalAllocated, 45);
        assert.strictEqual(result.allocations.length, 2);

        // Batch pertama yang dipotong adalah Batch 2 (expired paling cepat)
        assert.strictEqual(result.allocations[0].batch_id, 2);
        assert.strictEqual(result.allocations[0].deducted, 20);
        assert.strictEqual(result.allocations[0].remaining, 0);

        // Batch kedua yang dipotong adalah Batch 1
        assert.strictEqual(result.allocations[1].batch_id, 1);
        assert.strictEqual(result.allocations[1].deducted, 25);
        assert.strictEqual(result.allocations[1].remaining, 5);
    });

    test('4. Tiebreaker: Tanggal expired sama, potong yang diterima lebih dulu (FIFO tiebreaker)', () => {
        const batches = [
            { batch_id: 10, batch_code: 'BTC-010', quantity: 15, expired_date: '2026-10-01', received_date: '2026-02-15' },
            { batch_id: 11, batch_code: 'BTC-011', quantity: 20, expired_date: '2026-10-01', received_date: '2026-01-10' } // Diterima duluan
        ];

        const result = allocateFefoBatches(batches, 10);

        assert.strictEqual(result.fulfilled, true);
        assert.strictEqual(result.allocations[0].batch_id, 11);
        assert.strictEqual(result.allocations[0].deducted, 10);
        assert.strictEqual(result.allocations[0].remaining, 10);
    });

    test('5. Tiebreaker: Tanggal expired dan received sama, potong batch_id lebih kecil', () => {
        const batches = [
            { batch_id: 20, batch_code: 'BTC-020', quantity: 15, expired_date: '2026-10-01', received_date: '2026-01-01' },
            { batch_id: 15, batch_code: 'BTC-015', quantity: 20, expired_date: '2026-10-01', received_date: '2026-01-01' }
        ];

        const result = allocateFefoBatches(batches, 5);

        assert.strictEqual(result.fulfilled, true);
        assert.strictEqual(result.allocations[0].batch_id, 15);
    });

    test('6. Stok tidak mencukupi (Insufficient Stock)', () => {
        const batches = [
            { batch_id: 1, batch_code: 'BTC-001', quantity: 10, expired_date: '2026-12-01', received_date: '2026-01-01' },
            { batch_id: 2, batch_code: 'BTC-002', quantity: 15, expired_date: '2026-12-05', received_date: '2026-01-02' }
        ];

        const result = allocateFefoBatches(batches, 50);

        assert.strictEqual(result.fulfilled, false);
        assert.strictEqual(result.totalAllocated, 25);
        assert.strictEqual(result.allocations.length, 2);
    });

    test('7. Abaikan batch dengan quantity = 0', () => {
        const batches = [
            { batch_id: 1, batch_code: 'BTC-001', quantity: 0, expired_date: '2026-05-01', received_date: '2026-01-01' },
            { batch_id: 2, batch_code: 'BTC-002', quantity: 20, expired_date: '2026-09-01', received_date: '2026-01-02' }
        ];

        const result = allocateFefoBatches(batches, 10);

        assert.strictEqual(result.fulfilled, true);
        assert.strictEqual(result.allocations.length, 1);
        assert.strictEqual(result.allocations[0].batch_id, 2);
    });

    test('8. Penanganan input edge cases (array kosong, invalid input)', () => {
        assert.strictEqual(allocateFefoBatches([], 10).fulfilled, false);
        assert.strictEqual(allocateFefoBatches(null, 10).fulfilled, false);
        assert.strictEqual(allocateFefoBatches([{ quantity: 10 }], 0).fulfilled, false);
        assert.strictEqual(allocateFefoBatches([{ quantity: 10 }], -5).fulfilled, false);
    });
});
