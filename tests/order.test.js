const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    generatePoNumber,
    generateSoNumber,
    createPurchaseOrder,
    approvePurchaseOrder,
    receivePurchaseOrder,
    cancelPurchaseOrder,
    createSalesOrder,
    confirmSalesOrder,
    dispatchSalesOrder,
    cancelSalesOrder
} = require('../src/services/orderService');
const { authorizeRole } = require('../src/middlewares/authMiddleware');

function createMockDb() {
    let transactionActive = false;
    let rollbackCalled = false;
    let commitCalled = false;

    const data = {
        suppliers: [
            { supplier_id: 1, supplier_code: 'SUP-001', supplier_name: 'PT Charoen Feedmill', is_active: 1 }
        ],
        facilities: [
            { facility_id: 1, facility_code: 'WH-JKT-01', facility_name: 'Gudang Pusat Cakung' }
        ],
        products: [
            { product_id: 'PRD-FEED-01', product_name: 'Pakan Broiler Starter', stock: 100, is_active: 1 }
        ],
        locations: [
            { location_id: 1, facility_id: 1, location_code: 'JKT-A-01' }
        ],
        batches: [
            {
                batch_id: 1,
                batch_code: 'BTC-FEED-01',
                product_id: 'PRD-FEED-01',
                location_id: 1,
                quantity: 100,
                expired_date: '2026-12-31',
                received_date: '2026-09-01'
            }
        ],
        purchaseOrders: [],
        purchaseOrderItems: [],
        salesOrders: [],
        salesOrderItems: [],
        transactions: [],
        transactionItems: []
    };

    let nextPoId = 1;
    let nextPoiId = 1;
    let nextSoId = 1;
    let nextSoiId = 1;
    let nextBatchId = 10;
    let nextTrxId = 100;

    const connection = {
        beginTransaction: async () => {
            transactionActive = true;
            rollbackCalled = false;
            commitCalled = false;
        },
        commit: async () => {
            commitCalled = true;
            transactionActive = false;
        },
        rollback: async () => {
            rollbackCalled = true;
            transactionActive = false;
        },
        release: () => {},
        isTransactionActive: () => transactionActive,
        isRollbackCalled: () => rollbackCalled,
        isCommitCalled: () => commitCalled,
        getData: () => data,

        query: async (sql, params = []) => {
            const sqlUpper = sql.toUpperCase();

            // 1. PO Queries
            if (sqlUpper.includes('INSERT INTO PURCHASE_ORDERS')) {
                const poId = nextPoId++;
                const newPo = {
                    po_id: poId,
                    po_number: params[0],
                    supplier_id: params[1],
                    facility_id: params[2],
                    status: 'DRAFT',
                    total_amount: params[3],
                    order_date: params[4],
                    expected_delivery_date: params[5],
                    created_by: params[6],
                    approved_by: null,
                    notes: params[7]
                };
                data.purchaseOrders.push(newPo);
                return [{ insertId: poId }];
            }

            if (sqlUpper.includes('INSERT INTO PURCHASE_ORDER_ITEMS')) {
                const itemId = nextPoiId++;
                const newItem = {
                    item_id: itemId,
                    po_id: params[0],
                    product_id: params[1],
                    ordered_quantity: params[2],
                    received_quantity: 0,
                    unit_cost: params[3]
                };
                data.purchaseOrderItems.push(newItem);
                return [{ insertId: itemId }];
            }

            if (sqlUpper.includes('SELECT * FROM PURCHASE_ORDERS WHERE PO_ID = ?')) {
                const po = data.purchaseOrders.find(p => p.po_id === Number(params[0]));
                return [po ? [po] : []];
            }

            if (sqlUpper.includes('SELECT * FROM PURCHASE_ORDER_ITEMS WHERE PO_ID = ?')) {
                const items = data.purchaseOrderItems.filter(i => i.po_id === Number(params[0]));
                return [items];
            }

            if (sqlUpper.includes('UPDATE PURCHASE_ORDERS SET STATUS = \'APPROVED\'')) {
                const po = data.purchaseOrders.find(p => p.po_id === Number(params[1]));
                if (po) {
                    po.status = 'APPROVED';
                    po.approved_by = params[0];
                }
                return [{ affectedRows: po ? 1 : 0 }];
            }

            if (sqlUpper.includes('UPDATE PURCHASE_ORDERS SET STATUS = ?')) {
                const po = data.purchaseOrders.find(p => p.po_id === Number(params[1]));
                if (po) po.status = params[0];
                return [{ affectedRows: po ? 1 : 0 }];
            }

            if (sqlUpper.includes('UPDATE PURCHASE_ORDER_ITEMS SET RECEIVED_QUANTITY = ?')) {
                const item = data.purchaseOrderItems.find(i => i.item_id === Number(params[1]));
                if (item) item.received_quantity = params[0];
                return [{ affectedRows: item ? 1 : 0 }];
            }

            // 2. SO Queries
            if (sqlUpper.includes('INSERT INTO SALES_ORDERS')) {
                const soId = nextSoId++;
                const newSo = {
                    so_id: soId,
                    so_number: params[0],
                    facility_id: params[1],
                    customer_name: params[2],
                    customer_phone: params[3],
                    customer_address: params[4],
                    status: 'DRAFT',
                    total_amount: params[5],
                    order_date: params[6],
                    delivery_date: params[7],
                    created_by: params[8],
                    notes: params[9]
                };
                data.salesOrders.push(newSo);
                return [{ insertId: soId }];
            }

            if (sqlUpper.includes('INSERT INTO SALES_ORDER_ITEMS')) {
                const itemId = nextSoiId++;
                const newItem = {
                    item_id: itemId,
                    so_id: params[0],
                    product_id: params[1],
                    requested_quantity: params[2],
                    unit_price: params[3]
                };
                data.salesOrderItems.push(newItem);
                return [{ insertId: itemId }];
            }

            if (sqlUpper.includes('SELECT * FROM SALES_ORDERS WHERE SO_ID = ?')) {
                const so = data.salesOrders.find(s => s.so_id === Number(params[0]));
                return [so ? [so] : []];
            }

            if (sqlUpper.includes('SELECT * FROM SALES_ORDER_ITEMS WHERE SO_ID = ?')) {
                const items = data.salesOrderItems.filter(i => i.so_id === Number(params[0]));
                return [items];
            }

            if (sqlUpper.includes('UPDATE SALES_ORDERS SET STATUS = \'CONFIRMED\'')) {
                const so = data.salesOrders.find(s => s.so_id === Number(params[0]));
                if (so) so.status = 'CONFIRMED';
                return [{ affectedRows: so ? 1 : 0 }];
            }

            if (sqlUpper.includes('UPDATE SALES_ORDERS SET STATUS = \'DISPATCHED\'')) {
                const so = data.salesOrders.find(s => s.so_id === Number(params[0]));
                if (so) so.status = 'DISPATCHED';
                return [{ affectedRows: so ? 1 : 0 }];
            }

            if (sqlUpper.includes('UPDATE SALES_ORDERS SET STATUS = \'CANCELLED\'')) {
                const so = data.salesOrders.find(s => s.so_id === Number(params[1]));
                if (so) {
                    so.status = 'CANCELLED';
                    so.notes = params[0];
                }
                return [{ affectedRows: so ? 1 : 0 }];
            }

            // 3. Inventory & Batches (FEFO & Inbound)
            if (sqlUpper.includes('SELECT PRODUCT_ID, PRODUCT_NAME, IS_ACTIVE FROM PRODUCTS')) {
                const p = data.products.find(pr => pr.product_id === params[0]);
                return [p ? [p] : []];
            }

            if (sqlUpper.includes('FROM INVENTORY_BATCHES')) {
                if (sqlUpper.includes('EXPIRED_STOCK')) {
                    return [[{ expired_stock: 0 }]];
                }
                const productId = params[0];
                const batches = data.batches.filter(b => b.product_id === productId && b.quantity > 0);
                return [batches];
            }

            if (sqlUpper.includes('UPDATE INVENTORY_BATCHES SET QUANTITY = ?')) {
                const b = data.batches.find(bt => bt.batch_id === Number(params[1]));
                if (b) b.quantity = params[0];
                return [{ affectedRows: b ? 1 : 0 }];
            }

            if (sqlUpper.includes('INSERT INTO INVENTORY_BATCHES')) {
                const bId = nextBatchId++;
                const newBatch = {
                    batch_id: bId,
                    batch_code: params[0],
                    product_id: params[1],
                    supplier_id: params[2],
                    location_id: params[3],
                    initial_quantity: params[4],
                    quantity: params[5],
                    expired_date: params[6],
                    received_date: params[7],
                    notes: params[8]
                };
                data.batches.push(newBatch);
                return [{ insertId: bId }];
            }

            if (sqlUpper.includes('INSERT INTO STOCK_TRANSACTIONS')) {
                const trxId = nextTrxId++;
                let tType = 'IN';
                if (sqlUpper.includes('\'OUT\'')) tType = 'OUT';
                else if (sqlUpper.includes('\'DISPOSAL\'')) tType = 'DISPOSAL';
                const trx = {
                    transaction_id: trxId,
                    reference_no: params[0],
                    product_id: params[1],
                    user_id: params[2],
                    transaction_type: tType,
                    quantity: params[3],
                    notes: params[4]
                };
                data.transactions.push(trx);
                return [{ insertId: trxId }];
            }

            if (sqlUpper.includes('INSERT INTO STOCK_TRANSACTION_ITEMS')) {
                data.transactionItems.push({
                    transaction_id: params[0],
                    batch_id: params[1],
                    quantity: params[2]
                });
                return [{ affectedRows: 1 }];
            }

            return [[]];
        }
    };

    return connection;
}

describe('Phase 18: Purchase Orders (PO) & Sales Orders (SO) Quality Gate Tests', () => {
    let mockConn;

    beforeEach(() => {
        mockConn = createMockDb();
    });

    // 1. Reference Numbers
    test('1. Generator nomor referensi PO dan SO menghasilkan format standar', () => {
        const poNum = generatePoNumber();
        const soNum = generateSoNumber();

        assert.match(poNum, /^PO-\d{8}-[A-F0-9]{4}$/);
        assert.match(soNum, /^SO-\d{8}-[A-F0-9]{4}$/);
    });

    // 2. PO Creation & Validation
    test('2. createPurchaseOrder berhasil membuat PO berstatus DRAFT dengan kalkulasi total akurat', async () => {
        const payload = {
            supplier_id: 1,
            facility_id: 1,
            expected_delivery_date: '2026-11-15',
            notes: 'Restock pakan mingguan',
            user_id: 2,
            items: [
                { product_id: 'PRD-FEED-01', ordered_quantity: 40, unit_cost: 450000.00 }
            ]
        };

        const result = await createPurchaseOrder(mockConn, payload);
        assert.strictEqual(result.status, 'DRAFT');
        assert.strictEqual(result.total_amount, 18000000.00);
        assert.strictEqual(result.total_items, 1);
        assert.match(result.po_number, /^PO-/);

        const data = mockConn.getData();
        assert.strictEqual(data.purchaseOrders.length, 1);
        assert.strictEqual(data.purchaseOrderItems.length, 1);
        assert.strictEqual(data.purchaseOrderItems[0].ordered_quantity, 40);
    });

    test('3. createPurchaseOrder gagal jika daftar item produk kosong', async () => {
        await assert.rejects(
            async () => {
                await createPurchaseOrder(mockConn, {
                    supplier_id: 1,
                    facility_id: 1,
                    items: []
                });
            },
            /tidak boleh kosong/i
        );
    });

    // 3. PO Approval
    test('4. approvePurchaseOrder berhasil mengubah status PO dari DRAFT menjadi APPROVED', async () => {
        const po = await createPurchaseOrder(mockConn, {
            supplier_id: 1,
            facility_id: 1,
            user_id: 2,
            items: [{ product_id: 'PRD-FEED-01', ordered_quantity: 20, unit_cost: 100000 }]
        });

        const approved = await approvePurchaseOrder(mockConn, po.po_id, { user_id: 1, role: 'ADMIN' });
        assert.strictEqual(approved.status, 'APPROVED');

        const dbPo = mockConn.getData().purchaseOrders.find(p => p.po_id === po.po_id);
        assert.strictEqual(dbPo.status, 'APPROVED');
    });

    // 4. PO Inbound Receiving
    test('5. receivePurchaseOrder gagal jika PO masih berstatus DRAFT (Belum disetujui)', async () => {
        const po = await createPurchaseOrder(mockConn, {
            supplier_id: 1,
            facility_id: 1,
            items: [{ product_id: 'PRD-FEED-01', ordered_quantity: 20, unit_cost: 100000 }]
        });

        await assert.rejects(
            async () => {
                await receivePurchaseOrder(mockConn, po.po_id, {
                    items: [{ product_id: 'PRD-FEED-01', received_quantity: 20, location_id: 1, expired_date: '2027-01-01' }]
                });
            },
            /tidak dapat diterima.*DRAFT/i
        );
    });

    test('6. receivePurchaseOrder berhasil menerima sebagian barang (PARTIALLY_RECEIVED)', async () => {
        const po = await createPurchaseOrder(mockConn, {
            supplier_id: 1,
            facility_id: 1,
            items: [{ product_id: 'PRD-FEED-01', ordered_quantity: 50, unit_cost: 100000 }]
        });
        await approvePurchaseOrder(mockConn, po.po_id, { user_id: 1 });

        // Terima 30 dari 50 unit
        const rec = await receivePurchaseOrder(mockConn, po.po_id, {
            items: [{ product_id: 'PRD-FEED-01', received_quantity: 30, location_id: 1, expired_date: '2027-01-01' }],
            user_id: 3
        });

        assert.strictEqual(rec.status, 'PARTIALLY_RECEIVED');
        assert.strictEqual(rec.received_items.length, 1);
        assert.strictEqual(rec.received_items[0].received_quantity, 30);

        // Batch fisik bertambah di tabel batches
        const data = mockConn.getData();
        const newBatch = data.batches.find(b => b.initial_quantity === 30);
        assert.ok(newBatch, 'Batch penerimaan baru harus tercatat di sistem');
        assert.strictEqual(newBatch.quantity, 30);
    });

    test('7. receivePurchaseOrder menolak kuantitas penerimaan yang melebihi sisa pesanan PO', async () => {
        const po = await createPurchaseOrder(mockConn, {
            supplier_id: 1,
            facility_id: 1,
            items: [{ product_id: 'PRD-FEED-01', ordered_quantity: 20, unit_cost: 100000 }]
        });
        await approvePurchaseOrder(mockConn, po.po_id, { user_id: 1 });

        await assert.rejects(
            async () => {
                await receivePurchaseOrder(mockConn, po.po_id, {
                    items: [{ product_id: 'PRD-FEED-01', received_quantity: 25, location_id: 1, expired_date: '2027-01-01' }]
                });
            },
            /melebihi sisa pesanan PO/i
        );
    });

    test('8. receivePurchaseOrder mengubah status menjadi RECEIVED setelah seluruh item diterima 100%', async () => {
        const po = await createPurchaseOrder(mockConn, {
            supplier_id: 1,
            facility_id: 1,
            items: [{ product_id: 'PRD-FEED-01', ordered_quantity: 20, unit_cost: 100000 }]
        });
        await approvePurchaseOrder(mockConn, po.po_id, { user_id: 1 });

        const rec = await receivePurchaseOrder(mockConn, po.po_id, {
            items: [{ product_id: 'PRD-FEED-01', received_quantity: 20, location_id: 1, expired_date: '2027-01-01' }]
        });

        assert.strictEqual(rec.status, 'RECEIVED');
    });

    // 5. PO Cancellation
    test('9. cancelPurchaseOrder menolak pembatalan jika PO sudah berstatus RECEIVED', async () => {
        const po = await createPurchaseOrder(mockConn, {
            supplier_id: 1,
            facility_id: 1,
            items: [{ product_id: 'PRD-FEED-01', ordered_quantity: 10, unit_cost: 100000 }]
        });
        await approvePurchaseOrder(mockConn, po.po_id, { user_id: 1 });
        await receivePurchaseOrder(mockConn, po.po_id, {
            items: [{ product_id: 'PRD-FEED-01', received_quantity: 10, location_id: 1, expired_date: '2027-01-01' }]
        });

        await assert.rejects(
            async () => {
                await cancelPurchaseOrder(mockConn, po.po_id, { reason: 'Batal', user: { full_name: 'Admin' } });
            },
            /telah diterima penuh.*tidak dapat dibatalkan/i
        );
    });

    // 6. Sales Order Creation & Confirmation
    test('10. createSalesOrder berhasil membuat SO berstatus DRAFT dengan kalkulasi total', async () => {
        const payload = {
            facility_id: 1,
            customer_name: 'CV Ternak Makmur',
            customer_phone: '0812-3456-7890',
            customer_address: 'Jl. Pemuda No. 10',
            user_id: 2,
            items: [
                { product_id: 'PRD-FEED-01', requested_quantity: 30, unit_price: 500000.00 }
            ]
        };

        const result = await createSalesOrder(mockConn, payload);
        assert.strictEqual(result.status, 'DRAFT');
        assert.strictEqual(result.total_amount, 15000000.00);
        assert.match(result.so_number, /^SO-/);
    });

    test('11. confirmSalesOrder berhasil mengonfirmasi status SO menjadi CONFIRMED', async () => {
        const so = await createSalesOrder(mockConn, {
            facility_id: 1,
            customer_name: 'Pak Joko',
            items: [{ product_id: 'PRD-FEED-01', requested_quantity: 10, unit_price: 500000 }]
        });

        const confirmed = await confirmSalesOrder(mockConn, so.so_id, { user_id: 2 });
        assert.strictEqual(confirmed.status, 'CONFIRMED');
    });

    // 7. Sales Order Dispatch & FEFO Depletion
    test('12. dispatchSalesOrder memotong stok via FEFO dan mengubah status menjadi DISPATCHED', async () => {
        const so = await createSalesOrder(mockConn, {
            facility_id: 1,
            customer_name: 'Toko Sumber Rezeki',
            items: [{ product_id: 'PRD-FEED-01', requested_quantity: 25, unit_price: 500000 }]
        });
        await confirmSalesOrder(mockConn, so.so_id, { user_id: 2 });

        const dispatched = await dispatchSalesOrder(mockConn, so.so_id, { notes: 'Kirim via Truk Box', user_id: 3 });
        assert.strictEqual(dispatched.status, 'DISPATCHED');
        assert.strictEqual(dispatched.dispatched_items[0].total_deducted, 25);

        // Verifikasi saldo batch berkurang dari 100 menjadi 75
        const batch = mockConn.getData().batches.find(b => b.batch_id === 1);
        assert.strictEqual(batch.quantity, 75);
    });

    test('13. dispatchSalesOrder gagal jika stok di gudang tidak mencukupi permintaan pelanggan', async () => {
        const so = await createSalesOrder(mockConn, {
            facility_id: 1,
            customer_name: 'Toko Sumber Rezeki',
            items: [{ product_id: 'PRD-FEED-01', requested_quantity: 999, unit_price: 500000 }]
        });
        await confirmSalesOrder(mockConn, so.so_id, { user_id: 2 });

        await assert.rejects(
            async () => {
                await dispatchSalesOrder(mockConn, so.so_id, { user_id: 3 });
            },
            /Stok tidak mencukupi/i
        );
    });

    test('14. cancelSalesOrder berhasil membatalkan SO berstatus DRAFT atau CONFIRMED', async () => {
        const so = await createSalesOrder(mockConn, {
            facility_id: 1,
            customer_name: 'Customer Cancel',
            items: [{ product_id: 'PRD-FEED-01', requested_quantity: 10, unit_price: 500000 }]
        });

        const cancelled = await cancelSalesOrder(mockConn, so.so_id, { reason: 'Pelanggan membatalkan pesanan', user: { full_name: 'Manager' } });
        assert.strictEqual(cancelled.status, 'CANCELLED');
    });

    // 8. RBAC Boundary Enforcement
    test('15. Role STAFF ditolak saat mencoba menyetujui PO atau membatalkan SO (Hanya Admin / Manager)', () => {
        const req = { user: { role: 'STAFF' } };
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
});
