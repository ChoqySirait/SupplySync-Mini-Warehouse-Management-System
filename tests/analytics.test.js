const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

function calculateAssetValuation(productsWithStock) {
    return productsWithStock.reduce((total, p) => {
        const stock = p.total_stock || 0;
        const price = p.cost_price || 0;
        return total + (stock * price);
    }, 0);
}

function calculateFreshnessHealthScore(totalBatches, freshBatches) {
    if (totalBatches <= 0) return 100;
    return Math.round((freshBatches / totalBatches) * 100);
}

describe('Warehouse KPI & Inventory Valuation Analytics Tests', () => {
    test('1. Perhitungan valuasi total aset stok inventaris akurat', () => {
        const inventory = [
            { product_id: 'PRD-FEED-01', total_stock: 65, cost_price: 450000 },  // 29.250.000
            { product_id: 'PRD-OIL-01', total_stock: 60, cost_price: 95000 },    //  5.700.000
            { product_id: 'PRD-MEAT-01', total_stock: 75, cost_price: 38000 }    //  2.850.000
        ];

        const totalValuation = calculateAssetValuation(inventory);
        assert.strictEqual(totalValuation, 37800000);
    });

    test('2. Penanganan produk tanpa harga pokok (cost_price 0)', () => {
        const inventory = [
            { product_id: 'PRD-01', total_stock: 10, cost_price: 0 },
            { product_id: 'PRD-02', total_stock: 5, cost_price: 10000 }
        ];

        assert.strictEqual(calculateAssetValuation(inventory), 50000);
    });

    test('3. Perhitungan Skor Kesehatan Kesegaran Batch (Freshness Score)', () => {
        // 8 batch segar dari 10 total batch aktif = 80%
        assert.strictEqual(calculateFreshnessHealthScore(10, 8), 80);

        // Seluruh batch segar = 100%
        assert.strictEqual(calculateFreshnessHealthScore(5, 5), 100);

        // Gudang kosong (0 batch) = 100%
        assert.strictEqual(calculateFreshnessHealthScore(0, 0), 100);
    });
});
