const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { processStockOutFefo } = require('../src/services/inventoryService');

describe('Concurrency & Row-Level Locking (SELECT FOR UPDATE) Simulation Tests', () => {

    /**
     * Engine Mock Database dengan Re-entrant Mutex untuk Simulasi Row-Level Lock
     */
    function createConcurrentMockDb(initialQuantity = 50) {
        const batches = [
            {
                batch_id: 101,
                batch_code: 'BTC-LOCKED-01',
                product_id: 'PRD-CONC-01',
                facility_id: 1,
                quantity: initialQuantity,
                expired_date: '2026-12-31',
                received_date: '2026-01-01'
            }
        ];

        let lockOwner = null;
        const lockQueue = [];

        async function acquireLock(connId) {
            // Re-entrant: Jika koneksi ini sudah memegang lock transaksi, izinkan lanjut
            if (!lockOwner || lockOwner === connId) {
                lockOwner = connId;
                return;
            }
            // Antrikan koneksi lain sampai transaksi sebelumnya commit/rollback
            await new Promise(resolve => {
                lockQueue.push(() => {
                    lockOwner = connId;
                    resolve();
                });
            });
        }

        function releaseLock(connId) {
            if (lockOwner === connId) {
                if (lockQueue.length > 0) {
                    const next = lockQueue.shift();
                    next();
                } else {
                    lockOwner = null;
                }
            }
        }

        function createConnection(connId) {
            let inTransaction = false;

            return {
                connId,
                async beginTransaction() {
                    inTransaction = true;
                },
                async commit() {
                    inTransaction = false;
                    releaseLock(connId);
                },
                async rollback() {
                    inTransaction = false;
                    releaseLock(connId);
                },
                async query(sql, params) {
                    const upperSql = sql.toUpperCase();

                    // SELECT ... FOR UPDATE -> Simulasikan Row Lock Antrian
                    if (upperSql.includes('FOR UPDATE')) {
                        await acquireLock(connId);

                        if (upperSql.includes('FROM PRODUCTS')) {
                            return [[{ product_id: params[0], product_name: 'Concurrent Product', is_active: 1 }]];
                        }
                        if (upperSql.includes('FROM INVENTORY_BATCHES')) {
                            const available = batches
                                .filter(b => b.product_id === params[0] && b.facility_id === params[1] && b.quantity > 0)
                                .map(b => ({ ...b }));
                            return [available];
                        }
                    }

                    if (upperSql.includes('UPDATE INVENTORY_BATCHES SET QUANTITY')) {
                        const newQty = params[0];
                        const batchId = params[1];
                        const b = batches.find(item => item.batch_id === batchId);
                        if (b) {
                            b.quantity = newQty;
                        }
                        return [{ affectedRows: 1 }];
                    }

                    if (upperSql.includes('INSERT INTO STOCK_TRANSACTIONS')) {
                        return [{ insertId: 999 }];
                    }

                    if (upperSql.includes('INSERT INTO STOCK_TRANSACTION_ITEMS')) {
                        return [{ insertId: 888 }];
                    }

                    return [[]];
                },
                getBatchQuantity(batchId) {
                    const b = batches.find(item => item.batch_id === batchId);
                    return b ? b.quantity : 0;
                }
            };
        }

        return { createConnection };
    }

    test('1. Dua transaksi simultan terhadap batch yang sama: satu sukses, satu ditolak karena stok tidak cukup (Pencegahan Saldo Minus)', async () => {
        const mockDb = createConcurrentMockDb(50);
        const connA = mockDb.createConnection('Conn-A');
        const connB = mockDb.createConnection('Conn-B');

        // Total batch stok awal = 50.
        // Transaksi A minta 30, Transaksi B minta 30.
        // Hanya 1 yang boleh berhasil, total 60 > 50 sehingga yang kedua harus ditolak.

        const results = await Promise.allSettled([
            (async () => {
                await connA.beginTransaction();
                try {
                    const res = await processStockOutFefo(connA, {
                        product_id: 'PRD-CONC-01',
                        facility_id: 1,
                        quantity: 30,
                        notes: 'Simultaneous Order A'
                    });
                    await connA.commit();
                    return res;
                } catch (err) {
                    await connA.rollback();
                    throw err;
                }
            })(),
            (async () => {
                // Jeda 2ms agar masuk antrian lock
                await new Promise(r => setTimeout(r, 2));
                await connB.beginTransaction();
                try {
                    const res = await processStockOutFefo(connB, {
                        product_id: 'PRD-CONC-01',
                        facility_id: 1,
                        quantity: 30,
                        notes: 'Simultaneous Order B'
                    });
                    await connB.commit();
                    return res;
                } catch (err) {
                    await connB.rollback();
                    throw err;
                }
            })()
        ]);

        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');

        assert.equal(fulfilled.length, 1, 'Tepat 1 transaksi harus berhasil');
        assert.equal(rejected.length, 1, 'Transaksi kedua harus ditolak');
        assert.match(rejected[0].reason.message, /Stok tidak mencukupi/i);

        // Verifikasi sisa stok pada batch adalah tepat 20 (50 - 30), tidak pernah minus
        assert.equal(connA.getBatchQuantity(101), 20, 'Sisa stok harus tepat 20 tanpa inkonsistensi');
    });

    test('2. Rollback atomik pada kegagalan mutasi mempertahankan integritas data batch', async () => {
        const mockDb = createConcurrentMockDb(20);
        const conn = mockDb.createConnection('Conn-Rollback');

        await conn.beginTransaction();

        try {
            // Coba keluarkan kuantitas melebihi kapasitas (100 > 20)
            await processStockOutFefo(conn, {
                product_id: 'PRD-CONC-01',
                facility_id: 1,
                quantity: 100,
                notes: 'Excessive Quantity Order'
            });
            await conn.commit();
            assert.fail('Seharusnya melempar error stok tidak cukup');
        } catch (err) {
            await conn.rollback();
            assert.match(err.message, /Stok tidak mencukupi/i);
        }

        // Pastikan kuantitas batch tetap utuh setelah rollback
        assert.equal(conn.getBatchQuantity(101), 20, 'Kuantitas batch tidak boleh berkurang akibat transaksi yang di-rollback');
    });
});
