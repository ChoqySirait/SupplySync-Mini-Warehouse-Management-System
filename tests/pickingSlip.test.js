const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { allocateFefoBatches } = require('../src/services/inventoryService');

describe('Warehouse Bin Location & Picking Route Allocation Tests', () => {
    test('1. Alokasi FEFO menyertakan data lokasi rak dan rute lorong', () => {
        const batches = [
            {
                batch_id: 1,
                batch_code: 'BTC-FEED-01',
                quantity: 20,
                expired_date: '2026-11-20',
                location_code: 'A-01-01',
                zone_name: 'Zona Pakan Kering',
                aisle: 'Lorong 1',
                rack: 'Rak 1',
                tier: 'Tingkat 1',
                bin: 'Bin 01'
            },
            {
                batch_id: 2,
                batch_code: 'BTC-FEED-02',
                quantity: 50,
                expired_date: '2026-12-30',
                location_code: 'A-01-02',
                zone_name: 'Zona Pakan Kering',
                aisle: 'Lorong 1',
                rack: 'Rak 1',
                tier: 'Tingkat 2',
                bin: 'Bin 02'
            }
        ];

        const result = allocateFefoBatches(batches, 15);

        assert.strictEqual(result.fulfilled, true);
        assert.strictEqual(result.allocations.length, 1);
        const alloc = result.allocations[0];
        assert.strictEqual(alloc.batch_code, 'BTC-FEED-01');
        assert.strictEqual(alloc.location_code, 'A-01-01');
        assert.strictEqual(alloc.zone_name, 'Zona Pakan Kering');
        assert.strictEqual(alloc.aisle, 'Lorong 1');
        assert.strictEqual(alloc.rack, 'Rak 1');
        assert.strictEqual(alloc.tier, 'Tingkat 1');
        assert.strictEqual(alloc.bin, 'Bin 01');
    });

    test('2. Rute picking multi-batch mengarahkan staf gudang ke beberapa lokasi rak berurutan', () => {
        const batches = [
            {
                batch_id: 1,
                batch_code: 'BTC-01',
                quantity: 10,
                expired_date: '2026-06-01',
                location_code: 'A-01-01',
                zone_name: 'Zona Pakan',
                aisle: 'Lorong 1'
            },
            {
                batch_id: 2,
                batch_code: 'BTC-02',
                quantity: 20,
                expired_date: '2026-07-01',
                location_code: 'B-02-01',
                zone_name: 'Zona Sembako',
                aisle: 'Lorong 2'
            }
        ];

        const result = allocateFefoBatches(batches, 15);

        assert.strictEqual(result.fulfilled, true);
        assert.strictEqual(result.allocations.length, 2);
        // Lokasi pertama: A-01-01 (10 unit)
        assert.strictEqual(result.allocations[0].location_code, 'A-01-01');
        assert.strictEqual(result.allocations[0].deducted, 10);
        // Lokasi kedua: B-02-01 (5 unit)
        assert.strictEqual(result.allocations[1].location_code, 'B-02-01');
        assert.strictEqual(result.allocations[1].deducted, 5);
    });
});
