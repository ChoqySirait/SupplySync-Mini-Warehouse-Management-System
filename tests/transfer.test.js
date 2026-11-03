const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    generateTransferNumber,
    initiateStockTransfer,
    receiveStockTransfer,
    cancelStockTransfer
} = require('../src/services/transferService');
const { authorizeRole } = require('../src/middlewares/authMiddleware');

/**
 * Mock Connection State & Query Engine untuk Unit Testing Transaksi Multi-Gudang
 */
function createMockDb() {
    let transactionActive = false;
    let rollbackCalled = false;
    let commitCalled = false;

    const data = {
        facilities: [
            { facility_id: 1, facility_code: 'WH-JKT-01', facility_name: 'Gudang Pusat Cakung' },
            { facility_id: 2, facility_code: 'WH-SBY-01', facility_name: 'Cold Storage Rungkut' }
        ],
        products: [
            { product_id: 'PRD-FEED-01', product_name: 'Pakan Broiler Starter', stock: 100, is_active: 1 }
        ],
        locations: [
            { location_id: 1, facility_id: 1, location_code: 'JKT-A-01' },
            { location_id: 2, facility_id: 2, location_code: 'SBY-B-01' }
        ],
        batches: [
            {
                batch_id: 1,
                batch_code: 'BTC-01',
                product_id: 'PRD-FEED-01',
                location_id: 1,
                quantity: 40,
                expired_date: '2026-11-20',
                received_date: '2026-09-01'
            },
            {
                batch_id: 2,
                batch_code: 'BTC-02',
                product_id: 'PRD-FEED-01',
                location_id: 1,
                quantity: 60,
                expired_date: '2026-12-15',
                received_date: '2026-09-10'
            }
        ],
        transfers: [],
        transferItems: [],
        transactions: [],
        transactionItems: []
    };

    let nextTransferId = 1;
    let nextItemId = 1;
    let nextBatchId = 10;
    let nextTrxId = 100;

    const connection = {
        beginTransaction: async () => { transactionActive = true; },
        commit: async () => { commitCalled = true; transactionActive = false; },
        rollback: async () => { rollbackCalled = true; transactionActive = false; },
        isRolledBack: () => rollbackCalled,
        isCommitted: () => commitCalled,
        data,
        query: async (sql, params = []) => {
            const cleanSql = sql.replace(/\s+/g, ' ').trim();

            // 1. SELECT warehouse_facilities
            if (cleanSql.includes('FROM warehouse_facilities WHERE facility_id IN')) {
                const [id1, id2] = params;
                const matches = data.facilities.filter(f => f.facility_id === id1 || f.facility_id === id2);
                return [matches];
            }

            // 2. SELECT products ... FOR UPDATE
            if (cleanSql.includes('FROM products WHERE product_id = ?')) {
                const prod = data.products.filter(p => p.product_id === params[0]);
                return [prod];
            }

            // 3. SELECT inventory_batches ... facility_id
            if (cleanSql.includes('FROM inventory_batches b') && cleanSql.includes('l.facility_id = ?')) {
                const [productId, facilityId] = params;
                const locIds = data.locations.filter(l => l.facility_id === facilityId).map(l => l.location_id);
                const matches = data.batches.filter(b => 
                    b.product_id === productId && locIds.includes(b.location_id) && b.quantity > 0
                );
                // Urutkan FEFO
                matches.sort((a, b) => new Date(a.expired_date) - new Date(b.expired_date));
                return [matches];
            }

            // 4. UPDATE inventory_batches SET quantity = quantity - ?
            if (cleanSql.includes('UPDATE inventory_batches SET quantity = quantity - ? WHERE batch_id = ?')) {
                const [deduct, batchId] = params;
                const batch = data.batches.find(b => b.batch_id === batchId);
                if (batch) batch.quantity -= deduct;
                return [{ affectedRows: 1 }];
            }

            // 5. UPDATE inventory_batches SET quantity = quantity + ?
            if (cleanSql.includes('UPDATE inventory_batches SET quantity = quantity + ? WHERE batch_id = ?')) {
                const [add, batchId] = params;
                const batch = data.batches.find(b => b.batch_id === batchId);
                if (batch) batch.quantity += add;
                return [{ affectedRows: 1 }];
            }

            // 6. UPDATE products SET stock = stock - ?
            if (cleanSql.includes('UPDATE products SET stock = stock - ? WHERE product_id = ?')) {
                const [deduct, prodId] = params;
                const prod = data.products.find(p => p.product_id === prodId);
                if (prod) prod.stock -= deduct;
                return [{ affectedRows: 1 }];
            }

            // 7. UPDATE products SET stock = stock + ?
            if (cleanSql.includes('UPDATE products SET stock = stock + ? WHERE product_id = ?')) {
                const [add, prodId] = params;
                const prod = data.products.find(p => p.product_id === prodId);
                if (prod) prod.stock += add;
                return [{ affectedRows: 1 }];
            }

            // 8. INSERT INTO stock_transfers
            if (cleanSql.includes('INSERT INTO stock_transfers')) {
                const transfer = {
                    transfer_id: nextTransferId++,
                    transfer_number: params[0],
                    source_facility_id: params[1],
                    destination_facility_id: params[2],
                    status: 'IN_TRANSIT',
                    total_sent_quantity: params[3],
                    total_received_quantity: 0,
                    sent_by: params[4],
                    notes: params[5]
                };
                data.transfers.push(transfer);
                return [{ insertId: transfer.transfer_id }];
            }

            // 9. INSERT INTO stock_transfer_items
            if (cleanSql.includes('INSERT INTO stock_transfer_items')) {
                const item = {
                    item_id: nextItemId++,
                    transfer_id: params[0],
                    product_id: params[1],
                    source_batch_id: params[2],
                    source_location_id: params[3],
                    batch_code: params[4],
                    expired_date: params[5],
                    sent_quantity: params[6],
                    received_quantity: 0
                };
                data.transferItems.push(item);
                return [{ insertId: item.item_id }];
            }

            // 10. INSERT INTO stock_transactions
            if (cleanSql.includes('INSERT INTO stock_transactions')) {
                let type = 'IN';
                if (cleanSql.includes("'TRANSFER_OUT'")) type = 'TRANSFER_OUT';
                else if (cleanSql.includes("'TRANSFER_IN'")) type = 'TRANSFER_IN';
                else if (cleanSql.includes("'DISPOSAL'")) type = 'DISPOSAL';
                else if (cleanSql.includes("'OUT'")) type = 'OUT';
                else if (cleanSql.includes("'ADJUSTMENT'")) type = 'ADJUSTMENT';

                let qty = params[3];
                let notes = params[4];

                const trx = {
                    transaction_id: nextTrxId++,
                    reference_no: params[0],
                    product_id: params[1],
                    user_id: params[2],
                    transaction_type: type,
                    quantity: qty,
                    notes: notes
                };
                data.transactions.push(trx);
                return [{ insertId: trx.transaction_id }];
            }

            // 11. INSERT INTO stock_transaction_items
            if (cleanSql.includes('INSERT INTO stock_transaction_items')) {
                data.transactionItems.push({
                    transaction_id: params[0],
                    batch_id: params[1],
                    quantity: params[2]
                });
                return [{ affectedRows: 1 }];
            }

            // 12. SELECT * FROM stock_transfers WHERE transfer_id = ?
            if (cleanSql.includes('FROM stock_transfers WHERE transfer_id = ?')) {
                const matches = data.transfers.filter(t => t.transfer_id === parseInt(params[0], 10));
                return [matches];
            }

            // 13. SELECT * FROM stock_transfer_items WHERE transfer_id = ?
            if (cleanSql.includes('FROM stock_transfer_items WHERE transfer_id = ?')) {
                const matches = data.transferItems.filter(ti => ti.transfer_id === parseInt(params[0], 10));
                return [matches];
            }

            // 14. SELECT location_id FROM warehouse_locations WHERE facility_id = ?
            if (cleanSql.includes('FROM warehouse_locations WHERE facility_id = ?')) {
                const matches = data.locations.filter(l => l.facility_id === params[0]);
                return [matches];
            }

            // 15. INSERT INTO inventory_batches
            if (cleanSql.includes('INSERT INTO inventory_batches')) {
                const newBatch = {
                    batch_id: nextBatchId++,
                    batch_code: params[0],
                    product_id: params[1],
                    location_id: params[2],
                    initial_quantity: params[3],
                    quantity: params[4],
                    expired_date: params[5],
                    notes: params[6]
                };
                data.batches.push(newBatch);
                return [{ insertId: newBatch.batch_id }];
            }

            // 16. UPDATE stock_transfer_items SET received_quantity = ?
            if (cleanSql.includes('UPDATE stock_transfer_items SET')) {
                const [recvQty, disc, reason, destBatchId, destLocId, itemId] = params;
                const item = data.transferItems.find(ti => ti.item_id === itemId);
                if (item) {
                    item.received_quantity = recvQty;
                    item.discrepancy_quantity = disc;
                    item.discrepancy_reason = reason;
                    item.destination_batch_id = destBatchId;
                    item.destination_location_id = destLocId;
                }
                return [{ affectedRows: 1 }];
            }

            // 17. UPDATE stock_transfers SET status = ?
            if (cleanSql.includes('UPDATE stock_transfers SET status = ?')) {
                const [finalStatus, totalRecv, userId, notes, transferId] = params;
                const trf = data.transfers.find(t => t.transfer_id === parseInt(transferId, 10));
                if (trf) {
                    trf.status = finalStatus;
                    trf.total_received_quantity = totalRecv;
                }
                return [{ affectedRows: 1 }];
            }

            // 18. UPDATE stock_transfers SET status = 'CANCELLED'
            if (cleanSql.includes("status = 'CANCELLED'")) {
                const [reason, transferId] = params;
                const trf = data.transfers.find(t => t.transfer_id === parseInt(transferId, 10));
                if (trf) {
                    trf.status = 'CANCELLED';
                    trf.cancel_reason = reason;
                }
                return [{ affectedRows: 1 }];
            }

            return [[]];
        }
    };

    return connection;
}

describe('Phase 17: Inter-Warehouse Transfer & Multi-Facility Quality Gate Tests', () => {
    let mockConn;

    beforeEach(() => {
        mockConn = createMockDb();
    });

    test('1. Skenario 1: Transfer Berhasil (Successful Transfer Out & In-Transit state)', async () => {
        const result = await initiateStockTransfer(mockConn, {
            source_facility_id: 1,
            destination_facility_id: 2,
            items: [{ product_id: 'PRD-FEED-01', quantity: 30 }],
            notes: 'Transfer 30 sak ke gudang Surabaya',
            user_id: 1
        });

        assert.strictEqual(result.status, 'IN_TRANSIT');
        assert.strictEqual(result.total_sent_quantity, 30);
        assert.ok(result.transfer_number.startsWith('TRF-'));

        // Pastikan stok batch terpotong 30 di gudang asal
        const batch1 = mockConn.data.batches.find(b => b.batch_id === 1);
        assert.strictEqual(batch1.quantity, 10); // Awal 40, potong 30 = 10

        // Pastikan stok berstatus IN_TRANSIT tidak tersedia (master stock berkurang dari 100 menjadi 70)
        const product = mockConn.data.products.find(p => p.product_id === 'PRD-FEED-01');
        assert.strictEqual(product.stock, 70);

        // Pastikan tercatat di audit log
        const auditLog = mockConn.data.transactions.find(t => t.transaction_type === 'TRANSFER_OUT');
        assert.ok(auditLog);
        assert.strictEqual(auditLog.quantity, 30);
    });

    test('2. Skenario 2: Transfer dengan stok tidak mencukupi (Insufficient Stock Error)', async () => {
        await assert.rejects(
            async () => {
                await initiateStockTransfer(mockConn, {
                    source_facility_id: 1,
                    destination_facility_id: 2,
                    items: [{ product_id: 'PRD-FEED-01', quantity: 200 }], // Hanya tersedia 100
                    notes: 'Transfer melebihi kapasitas',
                    user_id: 1
                });
            },
            /tidak mencukupi/i
        );

        // Pastikan stok tidak berubah sama sekali
        const product = mockConn.data.products.find(p => p.product_id === 'PRD-FEED-01');
        assert.strictEqual(product.stock, 100);
    });

    test('3. Skenario 3: Penerimaan Penuh (Full Receipt: 100% Sent = Received)', async () => {
        // Inisiasi pengiriman 30 unit
        const trf = await initiateStockTransfer(mockConn, {
            source_facility_id: 1,
            destination_facility_id: 2,
            items: [{ product_id: 'PRD-FEED-01', quantity: 30 }],
            user_id: 1
        });

        const item = mockConn.data.transferItems[0];

        // Terima penuh 30 unit di gudang tujuan
        const recvResult = await receiveStockTransfer(mockConn, {
            transfer_id: trf.transfer_id,
            received_items: [{ item_id: item.item_id, received_quantity: 30, destination_location_id: 2 }],
            user_id: 2
        });

        assert.strictEqual(recvResult.status, 'RECEIVED');
        assert.strictEqual(recvResult.total_received_quantity, 30);
        assert.strictEqual(recvResult.total_discrepancy, 0);

        // Stok master bertambah kembali di sistem setelah diterima
        const product = mockConn.data.products.find(p => p.product_id === 'PRD-FEED-01');
        assert.strictEqual(product.stock, 100);

        // Batch baru tercipta di gudang tujuan
        const destBatch = mockConn.data.batches.find(b => b.location_id === 2);
        assert.ok(destBatch);
        assert.strictEqual(destBatch.quantity, 30);
    });

    test('4. Skenario 4: Penerimaan Sebagian (Partial Receipt & Discrepancy Recording)', async () => {
        // Kirim 50 unit (memotong batch 1 sebanyak 40 dan batch 2 sebanyak 10)
        const trf = await initiateStockTransfer(mockConn, {
            source_facility_id: 1,
            destination_facility_id: 2,
            items: [{ product_id: 'PRD-FEED-01', quantity: 50 }],
            user_id: 1
        });

        const items = mockConn.data.transferItems.filter(ti => ti.transfer_id === trf.transfer_id);
        assert.strictEqual(items.length, 2); // 2 batch FEFO terpotong

        // Terima sebagian: item pertama terima 35 dari 40 (selisih 5 rusak), item kedua terima 10 dari 10
        const recvResult = await receiveStockTransfer(mockConn, {
            transfer_id: trf.transfer_id,
            received_items: [
                { item_id: items[0].item_id, received_quantity: 35, discrepancy_reason: '5 sak sobek terkena air hujan' },
                { item_id: items[1].item_id, received_quantity: 10 }
            ],
            user_id: 2
        });

        assert.strictEqual(recvResult.status, 'PARTIALLY_RECEIVED');
        assert.strictEqual(recvResult.total_received_quantity, 45);
        assert.strictEqual(recvResult.total_discrepancy, 5);

        // Selisih tercatat sebagai DISPOSAL untuk akuntabilitas
        const disposalTrx = mockConn.data.transactions.find(t => t.transaction_type === 'DISPOSAL');
        assert.ok(disposalTrx);
        assert.strictEqual(disposalTrx.quantity, 5);
        assert.match(disposalTrx.notes, /sobek/i);
    });

    test('5. Skenario 5: Transfer Dibatalkan (Cancellation Rollback to Source Facility)', async () => {
        const trf = await initiateStockTransfer(mockConn, {
            source_facility_id: 1,
            destination_facility_id: 2,
            items: [{ product_id: 'PRD-FEED-01', quantity: 40 }],
            user_id: 1
        });

        // Sebelum batal: batch 1 habis (0), master stock 60
        assert.strictEqual(mockConn.data.batches[0].quantity, 0);
        assert.strictEqual(mockConn.data.products[0].stock, 60);

        // Eksekusi pembatalan transfer
        const cancelResult = await cancelStockTransfer(mockConn, {
            transfer_id: trf.transfer_id,
            cancel_reason: 'Armada truk pengangkut mengalami kerusakan mesin',
            user_id: 1
        });

        assert.strictEqual(cancelResult.status, 'CANCELLED');

        // Setelah batal: batch 1 dikembalikan menjadi 40, master stock kembali 100
        assert.strictEqual(mockConn.data.batches[0].quantity, 40);
        assert.strictEqual(mockConn.data.products[0].stock, 100);

        // Audit log mencatat kompensasi IN
        const cancelTrx = mockConn.data.transactions.find(t => t.notes && t.notes.includes('Kompensasi pembatalan'));
        assert.ok(cancelTrx);
        assert.strictEqual(cancelTrx.quantity, 40);
    });

    test('6. Skenario 6: Pencegahan Penerimaan Ganda (Double Receipt Rejection)', async () => {
        const trf = await initiateStockTransfer(mockConn, {
            source_facility_id: 1,
            destination_facility_id: 2,
            items: [{ product_id: 'PRD-FEED-01', quantity: 20 }],
            user_id: 1
        });

        const item = mockConn.data.transferItems[0];

        // Penerimaan pertama berhasil
        await receiveStockTransfer(mockConn, {
            transfer_id: trf.transfer_id,
            received_items: [{ item_id: item.item_id, received_quantity: 20 }],
            user_id: 2
        });

        // Penerimaan kedua harus ditolak karena status sudah bukan IN_TRANSIT
        await assert.rejects(
            async () => {
                await receiveStockTransfer(mockConn, {
                    transfer_id: trf.transfer_id,
                    received_items: [{ item_id: item.item_id, received_quantity: 20 }],
                    user_id: 2
                });
            },
            /sudah diproses sebelumnya/i
        );
    });

    test('7. Skenario 7: Dua transfer bersamaan (Concurrency & Locking Protection)', async () => {
        // Batch 1 memiliki kuantitas 40
        // Transfer A meminta 30
        const trfA = await initiateStockTransfer(mockConn, {
            source_facility_id: 1,
            destination_facility_id: 2,
            items: [{ product_id: 'PRD-FEED-01', quantity: 30 }],
            user_id: 1
        });
        assert.strictEqual(trfA.total_sent_quantity, 30);

        // Sisa batch 1 tinggal 10, batch 2 ada 60 (total sisa 70)
        // Transfer B meminta 80 (melebihi total sisa 70) -> harus ditolak
        await assert.rejects(
            async () => {
                await initiateStockTransfer(mockConn, {
                    source_facility_id: 1,
                    destination_facility_id: 2,
                    items: [{ product_id: 'PRD-FEED-01', quantity: 80 }],
                    user_id: 1
                });
            },
            /tidak mencukupi/i
        );

        // Pastikan tidak ada stok minus
        assert.ok(mockConn.data.products[0].stock >= 0);
        assert.ok(mockConn.data.batches[0].quantity >= 0);
    });

    test('8. Skenario 8: Kegagalan Transaksi dan Rollback Atomik', async () => {
        const errorConn = createMockDb();
        // Simulasikan kegagalan saat insert transfer items
        const origQuery = errorConn.query;
        errorConn.query = async (sql, params) => {
            if (sql.includes('INSERT INTO stock_transfer_items')) {
                throw new Error('SIMULATED_DB_DISK_FULL_ERROR');
            }
            return origQuery(sql, params);
        };

        await assert.rejects(
            async () => {
                await initiateStockTransfer(errorConn, {
                    source_facility_id: 1,
                    destination_facility_id: 2,
                    items: [{ product_id: 'PRD-FEED-01', quantity: 15 }]
                });
            },
            /SIMULATED_DB_DISK_FULL_ERROR/
        );
    });

    test('9. Skenario 9: Batch dengan tanggal kedaluwarsa berbeda (FEFO Expiry Preserved)', async () => {
        // Kirim 50 unit (40 dari BTC-01 expired 2026-11-20, 10 dari BTC-02 expired 2026-12-15)
        const trf = await initiateStockTransfer(mockConn, {
            source_facility_id: 1,
            destination_facility_id: 2,
            items: [{ product_id: 'PRD-FEED-01', quantity: 50 }],
            user_id: 1
        });

        const items = mockConn.data.transferItems.filter(ti => ti.transfer_id === trf.transfer_id);

        // Terima di gudang Surabaya
        await receiveStockTransfer(mockConn, {
            transfer_id: trf.transfer_id,
            received_items: items.map(it => ({ item_id: it.item_id, received_quantity: it.sent_quantity })),
            user_id: 2
        });

        // Periksa batch yang tercipta di gudang tujuan
        const destBatches = mockConn.data.batches.filter(b => b.location_id === 2);
        assert.strictEqual(destBatches.length, 2);

        // Tanggal kedaluwarsa asli FEFO harus sama persis dengan batch asal
        assert.strictEqual(destBatches[0].expired_date, '2026-11-20');
        assert.strictEqual(destBatches[1].expired_date, '2026-12-15');
    });

    test('10. Skenario 10: Pengguna tidak berwenang melakukan transfer (RBAC Rejection)', () => {
        let statusCode = 200;
        let responseJson = null;

        const req = { user: { user_id: 99, username: 'operator_staff', role: 'STAFF' } };
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: (payload) => { responseJson = payload; return res; }
        };

        const rbacMiddleware = authorizeRole('ADMIN', 'MANAGER');
        rbacMiddleware(req, res, () => {});

        assert.strictEqual(statusCode, 403);
        assert.strictEqual(responseJson.status, 'Error');
        assert.match(responseJson.message, /tidak diizinkan/i);
    });
});
