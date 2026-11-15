const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { generateToken, verifyToken, hashPassword, verifyPassword } = require('../src/utils/security');
const { allocateFefoBatches, processStockIn, processStockOutFefo, processStockOpname } = require('../src/services/inventoryService');
const { createPurchaseOrder, approvePurchaseOrder, receivePurchaseOrder } = require('../src/services/orderService');
const { calculateStockCardLedger } = require('../src/utils/stockLedger');
const { serializeToCsv } = require('../src/utils/csvParser');

describe('SupplySync End-to-End Enterprise WMS Lifecycle Integration Test', () => {

    function createLifecycleMockDb() {
        const store = {
            products: [
                { product_id: 'SKU-E2E-001', product_name: 'Premium Arabica Coffee 500g', category_id: 1, is_active: 1, cost_price: 50000, sale_price: 75000 }
            ],
            batches: [],
            stock_transactions: [],
            stock_transaction_items: [],
            purchase_orders: [],
            purchase_order_items: [],
            stock_opname: []
        };

        let nextPoId = 1;
        let nextPoItemId = 1;
        let nextBatchId = 1;
        let nextTrxId = 1;
        let nextOpnId = 1;

        return {
            store,
            async query(sql, params) {
                const upperSql = sql.toUpperCase();

                // SELECT PRODUCTS
                if (upperSql.includes('FROM PRODUCTS') && upperSql.includes('WHERE PRODUCT_ID = ?')) {
                    const found = store.products.filter(p => p.product_id === params[0]);
                    return [found];
                }

                // INSERT PURCHASE ORDER
                if (upperSql.includes('INSERT INTO PURCHASE_ORDERS')) {
                    const id = nextPoId++;
                    store.purchase_orders.push({
                        po_id: id,
                        po_number: params[0],
                        supplier_id: params[1],
                        facility_id: params[2],
                        order_date: params[3],
                        status: 'DRAFT',
                        total_amount: params[4],
                        notes: params[5],
                        created_by: params[6]
                    });
                    return [{ insertId: id }];
                }

                // INSERT PURCHASE ORDER ITEMS
                if (upperSql.includes('INSERT INTO PURCHASE_ORDER_ITEMS')) {
                    const id = nextPoItemId++;
                    store.purchase_order_items.push({
                        item_id: id,
                        po_id: params[0],
                        product_id: params[1],
                        ordered_quantity: params[2],
                        unit_cost: params[3],
                        subtotal: params[4],
                        received_quantity: 0
                    });
                    return [{ insertId: id }];
                }

                // SELECT PURCHASE ORDERS
                if (upperSql.includes('FROM PURCHASE_ORDERS') && upperSql.includes('PO_ID = ?')) {
                    const found = store.purchase_orders.filter(p => p.po_id === params[0]);
                    return [found];
                }

                // UPDATE PURCHASE ORDERS
                if (upperSql.includes('UPDATE PURCHASE_ORDERS')) {
                    const poId = params[params.length - 1];
                    const po = store.purchase_orders.find(p => p.po_id === poId);
                    if (po) {
                        if (upperSql.includes("STATUS = 'APPROVED'")) po.status = 'APPROVED';
                        else if (upperSql.includes("STATUS = 'RECEIVED'")) po.status = 'RECEIVED';
                        else if (upperSql.includes("STATUS = 'PARTIALLY_RECEIVED'")) po.status = 'PARTIALLY_RECEIVED';
                        else if (params[0] && typeof params[0] === 'string') po.status = params[0];
                    }
                    return [{ affectedRows: 1 }];
                }

                // SELECT PO ITEMS
                if (upperSql.includes('FROM PURCHASE_ORDER_ITEMS') && upperSql.includes('PO_ID = ?')) {
                    const items = store.purchase_order_items.filter(i => i.po_id === params[0]);
                    return [items];
                }

                // UPDATE PO ITEM RECEIVED
                if (upperSql.includes('UPDATE PURCHASE_ORDER_ITEMS SET RECEIVED_QUANTITY')) {
                    const item = store.purchase_order_items.find(i => i.item_id === params[1]);
                    if (item) {
                        item.received_quantity = params[0];
                    }
                    return [{ affectedRows: 1 }];
                }

                // INSERT INVENTORY BATCHES
                if (upperSql.includes('INSERT INTO INVENTORY_BATCHES')) {
                    const id = nextBatchId++;
                    const batch = {
                        batch_id: id,
                        batch_code: params[0],
                        product_id: params[1],
                        supplier_id: params[2],
                        location_id: params[3],
                        initial_quantity: params[4],
                        quantity: params[5],
                        expired_date: params[6],
                        received_date: params[7],
                        notes: params[8],
                        facility_id: params[9] || 1
                    };
                    store.batches.push(batch);
                    return [{ insertId: id }];
                }

                // SELECT INVENTORY BATCHES
                if (upperSql.includes('FROM INVENTORY_BATCHES')) {
                    if (upperSql.includes('SUM(QUANTITY)')) {
                        const sum = store.batches
                            .filter(b => b.product_id === params[0] && b.quantity > 0)
                            .reduce((acc, b) => acc + b.quantity, 0);
                        return [[{ total_stock: sum }]];
                    }
                    const found = store.batches.filter(b => b.product_id === params[0] && b.quantity > 0);
                    return [found];
                }

                // UPDATE INVENTORY BATCHES
                if (upperSql.includes('UPDATE INVENTORY_BATCHES SET QUANTITY')) {
                    const batch = store.batches.find(b => b.batch_id === params[1]);
                    if (batch) {
                        batch.quantity = params[0];
                    }
                    return [{ affectedRows: 1 }];
                }

                // INSERT STOCK TRANSACTIONS
                if (upperSql.includes('INSERT INTO STOCK_TRANSACTIONS')) {
                    const id = nextTrxId++;
                    store.stock_transactions.push({
                        transaction_id: id,
                        reference_no: params[0],
                        product_id: params[1],
                        facility_id: params[2],
                        user_id: params[3],
                        transaction_type: params[4],
                        quantity: params[5],
                        notes: params[6]
                    });
                    return [{ insertId: id }];
                }

                // INSERT STOCK TRANSACTION ITEMS
                if (upperSql.includes('INSERT INTO STOCK_TRANSACTION_ITEMS')) {
                    store.stock_transaction_items.push({
                        transaction_id: params[0],
                        batch_id: params[1],
                        quantity: params[2]
                    });
                    return [{ insertId: 1 }];
                }

                // INSERT STOCK OPNAME
                if (upperSql.includes('INSERT INTO STOCK_OPNAME')) {
                    const id = nextOpnId++;
                    store.stock_opname.push({
                        opname_id: id,
                        opname_number: params[0],
                        product_id: params[1],
                        facility_id: params[2],
                        system_stock: params[3],
                        physical_stock: params[4],
                        difference: params[5],
                        reason: params[6],
                        status: 'APPROVED'
                    });
                    return [{ insertId: id }];
                }

                return [[]];
            }
        };
    }

    test('1. Otentikasi Administrator Aman (NIST Hash & JWT Verification)', async () => {
        const passwordPlain = 'SuperSecret2026!';
        const hash = await hashPassword(passwordPlain);

        // Verifikasi format scrypt
        assert.ok(hash.startsWith('scrypt$'), 'Hash harus scrypt NIST standar');
        const isValid = await verifyPassword(passwordPlain, hash);
        assert.equal(isValid, true, 'Verifikasi password sah harus bernilai true');

        // Token generation
        const adminPayload = { userId: 1, username: 'admin', role: 'ADMIN', facility_id: 1 };
        const token = generateToken(adminPayload);
        assert.ok(typeof token === 'string', 'Token JWT harus string valid');

        const decoded = verifyToken(token);
        assert.equal(decoded.username, 'admin');
        assert.equal(decoded.role, 'ADMIN');
    });

    test('2. Siklus Lengkap: PO -> GRN Receipt (Batch Created) -> FEFO Outflow -> Stock Opname -> Ledger Verification', async () => {
        const mockDb = createLifecycleMockDb();
        const facilityId = 1;
        const productId = 'SKU-E2E-001';

        // Langkah A: Buat Purchase Order (PO)
        const poResult = await createPurchaseOrder(mockDb, {
            supplier_id: 10,
            facility_id: facilityId,
            notes: 'E2E PO Inbound',
            created_by: 1,
            items: [
                { product_id: productId, ordered_quantity: 100, unit_cost: 50000 }
            ]
        });

        assert.ok(poResult.po_id > 0, 'PO ID harus terbentuk');
        assert.ok(poResult.po_number.startsWith('PO-'), 'Nomor PO harus berformat PO-');

        // Langkah B: Setujui PO
        await approvePurchaseOrder(mockDb, poResult.po_id, { user_id: 1 });
        const po = mockDb.store.purchase_orders.find(p => p.po_id === poResult.po_id);
        assert.equal(po.status, 'APPROVED', 'Status PO harus APPROVED');

        // Langkah C: Terima Barang (GRN Receipt)
        const today = new Date().toISOString().split('T')[0];
        const expiryDate = '2027-06-30';
        await receivePurchaseOrder(mockDb, poResult.po_id, {
            items: [
                {
                    product_id: productId,
                    received_quantity: 100,
                    expired_date: expiryDate,
                    batch_code: 'BTC-E2E-001',
                    location_id: 1
                }
            ],
            notes: 'GRN Inbound',
            user_id: 1
        });

        // Verifikasi batch terbentuk di inventory_batches
        assert.equal(mockDb.store.batches.length, 1, 'Batch inventaris harus otomatis terbentuk');
        const batch = mockDb.store.batches[0];
        assert.equal(batch.quantity, 100, 'Kuantitas batch awal harus 100');
        assert.equal(batch.expired_date, expiryDate);

        // Langkah D: Alokasi FEFO Pengeluaran Stok (Stock Out 40 unit)
        const outResult = await processStockOutFefo(mockDb, {
            product_id: productId,
            facility_id: facilityId,
            quantity: 40,
            notes: 'E2E Sales Order Dispatch'
        });

        assert.equal(outResult.batches_affected.length, 1, 'Harus ada 1 alokasi batch');
        assert.equal(outResult.batches_affected[0].deducted, 40, 'Kuantitas terpotong harus 40');
        assert.equal(batch.quantity, 60, 'Sisa kuantitas pada batch harus 60 (100 - 40)');

        // Langkah E: Stock Opname (Fisik dihitung 58 unit, ada selisih defisit -2 unit)
        const opnameResult = await processStockOpname(mockDb, {
            product_id: productId,
            physical_stock: 58,
            facility_id: facilityId,
            reason: 'Audit fisik: 2 unit rusak di lantai',
            user_id: 1
        });

        assert.equal(opnameResult.system_stock, 60, 'Stok sistem sebelum opname harus 60');
        assert.equal(opnameResult.physical_stock, 58, 'Stok fisik harus 58');
        assert.equal(opnameResult.difference, -2, 'Selisih harus -2 (Defisit)');
        assert.equal(batch.quantity, 58, 'Batch harus dipotong 2 unit menjadi 58 via FEFO adjustment');

        // Langkah F: Verifikasi Buku Kartu Stok Ledger (Running Balance)
        const transactionsForLedger = [
            { transaction_id: 1, reference_no: 'TRX-IN-001', transaction_type: 'IN', quantity: 100, created_at: today, notes: 'GRN PO' },
            { transaction_id: 2, reference_no: 'TRX-OUT-001', transaction_type: 'OUT', quantity: 40, created_at: today, notes: 'SO Dispatch' },
            { transaction_id: 3, reference_no: 'TRX-ADJ-001', transaction_type: 'ADJUSTMENT', quantity: 2, created_at: today, notes: 'Opname Defisit' }
        ];

        const ledgerResult = calculateStockCardLedger({
            beginningBalance: 0,
            transactions: transactionsForLedger
        });

        assert.equal(ledgerResult.currentBalance, 58, 'Saldo berjalan akhir harus tepat 58');
        assert.equal(ledgerResult.entries.length, 3);
        assert.equal(ledgerResult.entries[0].running_balance, 100);
        assert.equal(ledgerResult.entries[1].running_balance, 60);
        assert.equal(ledgerResult.entries[2].running_balance, 58);

        // Langkah G: Serialisasi Ekspor CSV RFC-4180
        const csvOutput = serializeToCsv(ledgerResult.entries, [
            'reference_no',
            'transaction_type',
            'running_balance'
        ]);

        assert.ok(csvOutput.includes('reference_no,transaction_type,running_balance'), 'Header CSV harus valid');
        assert.ok(csvOutput.includes('TRX-IN-001,IN,100'), 'Baris pertama harus memiliki saldo 100');
        assert.ok(csvOutput.includes('TRX-ADJ-001,ADJUSTMENT,58'), 'Baris terakhir harus memiliki saldo 58');
    });
});
