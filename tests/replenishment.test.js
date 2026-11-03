const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    calculateReorderRecommendation,
    predictStockoutRisk,
    classifyBatchAgingTier
} = require('../src/services/replenishmentService');
const { createPurchaseOrder } = require('../src/services/orderService');
const { authorizeRole } = require('../src/middlewares/authMiddleware');

describe('Intelligent Replenishment & Batch Aging Analytics Tests (Phase 19)', () => {

    // ====================================================================
    // 1. REORDER RECOMMENDATION CALCULATION (MIN-MAX POLICY)
    // ====================================================================
    describe('1. Logika Perhitungan Rekomendasi Reorder (Min-Max Inventory)', () => {
        test('1. Skenario Low Stock tanpa on-order PO menghasilkan status REORDER_REQUIRED dan kuantitas target yang tepat', () => {
            // min_stock = 20, total_stock = 5 -> target = 40 (2 * 20), deficit = 35
            const res = calculateReorderRecommendation({
                totalStock: 5,
                minStock: 20,
                reorderQuantity: 0,
                onOrderQty: 0
            });

            assert.strictEqual(res.reorderStatus, 'REORDER_REQUIRED');
            assert.strictEqual(res.targetStock, 40);
            assert.strictEqual(res.grossDeficit, 35);
            assert.strictEqual(res.recommendedQty, 35);
        });

        test('2. Skenario Produk dengan Reorder Quantity kustom memprioritaskan ambang kustom (min + reorderQty)', () => {
            // min_stock = 20, reorderQuantity = 50, total_stock = 10 -> target = 70, deficit = 60
            const res = calculateReorderRecommendation({
                totalStock: 10,
                minStock: 20,
                reorderQuantity: 50,
                onOrderQty: 0
            });

            assert.strictEqual(res.reorderStatus, 'REORDER_REQUIRED');
            assert.strictEqual(res.targetStock, 70);
            assert.strictEqual(res.recommendedQty, 60);
        });

        test('3. Pencegahan Pemesanan Ganda (Double Ordering): Jika ada PO on-order yang mencukupi, status menjadi PO_IN_PIPELINE', () => {
            // min_stock = 20, total_stock = 5 (deficit = 35), onOrderQty = 40 (sudah ada PO aktif)
            const res = calculateReorderRecommendation({
                totalStock: 5,
                minStock: 20,
                reorderQuantity: 0,
                onOrderQty: 40
            });

            assert.strictEqual(res.reorderStatus, 'PO_IN_PIPELINE');
            assert.strictEqual(res.recommendedQty, 0, 'Tidak boleh memicu reorder baru karena pasokan sudah dalam pengiriman');
        });

        test('4. Skenario Out of Stock (Stok = 0) menghasilkan status OUT_OF_STOCK', () => {
            const res = calculateReorderRecommendation({
                totalStock: 0,
                minStock: 15,
                reorderQuantity: 0,
                onOrderQty: 0
            });

            assert.strictEqual(res.reorderStatus, 'OUT_OF_STOCK');
            assert.strictEqual(res.targetStock, 30);
            assert.strictEqual(res.recommendedQty, 30);
        });

        test('5. Skenario Stok Aman (Healthy Stock di atas batas minimum) menghasilkan status HEALTHY dan kuantitas 0', () => {
            const res = calculateReorderRecommendation({
                totalStock: 50,
                minStock: 20,
                reorderQuantity: 0,
                onOrderQty: 0
            });

            assert.strictEqual(res.reorderStatus, 'HEALTHY');
            assert.strictEqual(res.recommendedQty, 0);
        });
    });

    // ====================================================================
    // 2. STOCKOUT RISK PREDICTOR & BURN RATE
    // ====================================================================
    describe('2. Prediktor Risiko Kehabisan Stok (Stockout Predictor) vs Lead Time', () => {
        test('6. Skenario Kritis: Hari menuju stok habis <= Lead Time supplier memicu status CRITICAL', () => {
            // total_stock = 10, daily_burn_rate = 2 (habis dalam 5 hari), lead_time = 7 hari
            // Artinya jika baru memesan hari ini, gudang akan kehabisan stok 2 hari sebelum barang tiba!
            const pred = predictStockoutRisk({
                totalStock: 10,
                dailyBurnRate: 2,
                leadTimeDays: 7
            });

            assert.strictEqual(pred.daysToStockout, 5);
            assert.strictEqual(pred.stockoutRisk, 'CRITICAL');
        });

        test('7. Skenario Waspada Tinggi: Hari menuju habis antara lead_time dan 2x lead_time memicu status HIGH', () => {
            // total_stock = 24, daily_burn_rate = 2 (habis dalam 12 hari), lead_time = 7 hari (2x = 14)
            const pred = predictStockoutRisk({
                totalStock: 24,
                dailyBurnRate: 2,
                leadTimeDays: 7
            });

            assert.strictEqual(pred.daysToStockout, 12);
            assert.strictEqual(pred.stockoutRisk, 'HIGH');
        });

        test('8. Penanganan aman jika tidak ada transaksi keluar (Daily Burn Rate = 0)', () => {
            const pred = predictStockoutRisk({
                totalStock: 50,
                dailyBurnRate: 0,
                leadTimeDays: 7
            });

            assert.strictEqual(pred.daysToStockout, null);
            assert.strictEqual(pred.stockoutRisk, 'LOW');
        });

        test('9. Stok nol (0 unit) langsung berstatus CRITICAL dengan daysToStockout = 0', () => {
            const pred = predictStockoutRisk({
                totalStock: 0,
                dailyBurnRate: 5,
                leadTimeDays: 7
            });

            assert.strictEqual(pred.daysToStockout, 0);
            assert.strictEqual(pred.stockoutRisk, 'CRITICAL');
        });
    });

    // ====================================================================
    // 3. BATCH AGING CLASSIFICATION TIERS
    // ====================================================================
    describe('3. Klasifikasi Kategori Penuaan Batch (Batch Aging Tiers)', () => {
        test('10. Batch dengan tanggal kedaluwarsa lampau (<= 0 hari) masuk tier EXPIRED', () => {
            assert.strictEqual(classifyBatchAgingTier(0), 'EXPIRED');
            assert.strictEqual(classifyBatchAgingTier(-5), 'EXPIRED');
        });

        test('11. Batch mendekati kadaluwarsa (1 - 30 hari) masuk tier CRITICAL untuk prioritas FEFO', () => {
            assert.strictEqual(classifyBatchAgingTier(1), 'CRITICAL');
            assert.strictEqual(classifyBatchAgingTier(14), 'CRITICAL');
            assert.strictEqual(classifyBatchAgingTier(30), 'CRITICAL');
        });

        test('12. Batch berumur sedang (31 - 90 hari) masuk tier WARNING', () => {
            assert.strictEqual(classifyBatchAgingTier(31), 'WARNING');
            assert.strictEqual(classifyBatchAgingTier(60), 'WARNING');
            assert.strictEqual(classifyBatchAgingTier(90), 'WARNING');
        });

        test('13. Batch dengan umur simpan prima (> 90 hari) masuk tier HEALTHY', () => {
            assert.strictEqual(classifyBatchAgingTier(91), 'HEALTHY');
            assert.strictEqual(classifyBatchAgingTier(180), 'HEALTHY');
            assert.strictEqual(classifyBatchAgingTier(365), 'HEALTHY');
        });
    });

    // ====================================================================
    // 4. INTEGRASI PURCHASE ORDER & BULK CONSOLIDATION
    // ====================================================================
    describe('4. Pembangkitan Purchase Order Otomatis & Konsolidasi Bulk PO', () => {
        let mockConn;
        let createdOrders = [];
        let createdOrderItems = [];
        let nextPoId = 100;

        beforeEach(() => {
            createdOrders = [];
            createdOrderItems = [];
            nextPoId = 100;

            mockConn = {
                async query(sql, params) {
                    const upper = sql.trim().toUpperCase();

                    if (upper.startsWith('INSERT INTO PURCHASE_ORDERS')) {
                        const poId = nextPoId++;
                        const poRecord = {
                            po_id: poId,
                            po_number: params[0],
                            supplier_id: params[1],
                            facility_id: params[2],
                            status: 'DRAFT',
                            total_amount: params[3],
                            order_date: params[4],
                            expected_delivery_date: params[5],
                            created_by: params[6],
                            notes: params[7]
                        };
                        createdOrders.push(poRecord);
                        return [{ insertId: poId }];
                    }

                    if (upper.startsWith('INSERT INTO PURCHASE_ORDER_ITEMS')) {
                        const itemRecord = {
                            po_id: params[0],
                            product_id: params[1],
                            ordered_quantity: params[2],
                            received_quantity: 0,
                            unit_cost: params[3]
                        };
                        createdOrderItems.push(itemRecord);
                        return [{ insertId: createdOrderItems.length }];
                    }

                    return [[]];
                }
            };
        });

        test('14. Pembangkitan Draft PO otomatis menggunakan orderService menghasilkan status DRAFT dan nomor unik', async () => {
            const poPayload = {
                supplier_id: 1,
                facility_id: 1,
                items: [
                    { product_id: 'PRD-FEED-01', ordered_quantity: 35, unit_cost: 450000 }
                ],
                notes: 'Auto-generated dari Intelligent Replenishment Engine',
                user_id: 2
            };

            const result = await createPurchaseOrder(mockConn, poPayload);

            assert.strictEqual(result.status, 'DRAFT');
            assert.match(result.po_number, /^PO-\d{8}-[A-F0-9]{4}$/);
            assert.strictEqual(result.total_items, 1);
            assert.strictEqual(result.total_amount, 35 * 450000);
            assert.strictEqual(createdOrders.length, 1);
            assert.strictEqual(createdOrderItems.length, 1);
        });

        test('15. Konsolidasi Bulk PO mengelompokkan beberapa SKU dari pemasok yang sama ke dalam 1 Draft PO', async () => {
            // 3 produk untuk 2 supplier berbeda (Supplier 1: 2 produk, Supplier 2: 1 produk)
            const bulkItems = [
                { product_id: 'PRD-FEED-01', quantity: 30, supplier_id: 1, unit_cost: 450000 },
                { product_id: 'PRD-FEED-02', quantity: 20, supplier_id: 1, unit_cost: 475000 },
                { product_id: 'PRD-OIL-01', quantity: 40, supplier_id: 2, unit_cost: 95000 }
            ];

            // Kelompokkan item berdasarkan supplier_id
            const grouped = new Map();
            for (const item of bulkItems) {
                if (!grouped.has(item.supplier_id)) grouped.set(item.supplier_id, []);
                grouped.get(item.supplier_id).push({
                    product_id: item.product_id,
                    ordered_quantity: item.quantity,
                    unit_cost: item.unit_cost
                });
            }

            const generatedPos = [];
            for (const [supId, items] of grouped.entries()) {
                const po = await createPurchaseOrder(mockConn, {
                    supplier_id: supId,
                    facility_id: 1,
                    items,
                    notes: `Bulk PO untuk Pemasok #${supId}`,
                    user_id: 1
                });
                generatedPos.push(po);
            }

            assert.strictEqual(generatedPos.length, 2, 'Harus menghasilkan tepat 2 PO untuk 2 pemasok berbeda');
            assert.strictEqual(generatedPos[0].total_items, 2, 'PO Pemasok 1 harus menggabungkan 2 produk pakan');
            assert.strictEqual(generatedPos[1].total_items, 1, 'PO Pemasok 2 harus berisi 1 produk minyak');
        });
    });

    // ====================================================================
    // 5. RBAC & KEAMANAN OTORISASI REPLENISHMENT
    // ====================================================================
    describe('5. Penegakan Otorisasi RBAC pada Operasi Replenishment & Reorder', () => {
        test('16. Role STAFF ditolak (403 Forbidden) saat mencoba memicu pembuatan Reorder PO', () => {
            const req = { user: { role: 'STAFF', username: 'staff1' } };
            let status = 200;
            let responseBody = null;
            const res = {
                status(code) { status = code; return this; },
                json(data) { responseBody = data; return this; }
            };

            const middleware = authorizeRole('ADMIN', 'MANAGER');
            middleware(req, res, () => {});

            assert.strictEqual(status, 403);
            assert.match(responseBody.message, /Akses ditolak.*STAFF/i);
        });

        test('17. Role ADMIN dan MANAGER diizinkan mengakses operasi pembuatan Reorder PO', () => {
            const roles = ['ADMIN', 'MANAGER'];
            for (const role of roles) {
                const req = { user: { role } };
                let nextCalled = false;
                const res = {
                    status() { return this; },
                    json() { return this; }
                };

                const middleware = authorizeRole('ADMIN', 'MANAGER');
                middleware(req, res, () => {
                    nextCalled = true;
                });

                assert.strictEqual(nextCalled, true, `Role ${role} harus diizinkan lewat`);
            }
        });
    });
});
