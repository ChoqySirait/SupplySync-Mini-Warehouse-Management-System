const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { isRetryableError, executeWithRetry } = require('../src/utils/dbResilience');

describe('Database Resilience & Deadlock Auto-Retry Engine Tests', () => {

    test('1. Deteksi Error yang Dapat Di-retry (Deadlock & Lock Timeout)', () => {
        assert.equal(isRetryableError({ code: 'ER_LOCK_DEADLOCK' }), true);
        assert.equal(isRetryableError({ errno: 1213 }), true);
        assert.equal(isRetryableError({ code: 'ER_LOCK_WAIT_TIMEOUT' }), true);
        assert.equal(isRetryableError({ errno: 1205 }), true);
        assert.equal(isRetryableError(new Error('Deadlock found when trying to get lock; try restarting transaction')), true);

        // Non-retryable errors
        assert.equal(isRetryableError({ code: 'ER_DUP_ENTRY' }), false);
        assert.equal(isRetryableError({ code: 'ER_NO_SUCH_TABLE' }), false);
        assert.equal(isRetryableError(null), false);
    });

    test('2. Transaksi normal sukses pada percobaan pertama (Zero-retry overhead)', async () => {
        let attempts = 0;
        let committed = false;

        const mockPool = {
            async getConnection() {
                return {
                    async beginTransaction() {},
                    async commit() { committed = true; },
                    async rollback() {},
                    release() {}
                };
            }
        };

        const result = await executeWithRetry(mockPool, async (conn) => {
            attempts++;
            return { status: 'OK', records: 42 };
        });

        assert.equal(attempts, 1, 'Hanya boleh 1 kali percobaan jika tidak ada deadlock');
        assert.equal(committed, true, 'Transaksi harus di-commit');
        assert.equal(result.records, 42);
    });

    test('3. Pemulihan otomatis saat terjadi transient deadlock (Retry berlanjut sampai sukses)', async () => {
        let attempts = 0;
        let rollbackCount = 0;
        let commitCount = 0;

        const mockPool = {
            async getConnection() {
                return {
                    async beginTransaction() {},
                    async commit() { commitCount++; },
                    async rollback() { rollbackCount++; },
                    release() {}
                };
            }
        };

        const result = await executeWithRetry(mockPool, async (conn) => {
            attempts++;
            if (attempts === 1) {
                const err = new Error('Lock deadlock');
                err.code = 'ER_LOCK_DEADLOCK';
                throw err;
            }
            return { success: true, processedAttempt: attempts };
        }, 3, 10); // maxRetries: 3, delay: 10ms

        assert.equal(attempts, 2, 'Harus mencoba ulang ke percobaan ke-2 setelah deadlock');
        assert.equal(rollbackCount, 1, 'Percobaan pertama yang gagal harus di-rollback');
        assert.equal(commitCount, 1, 'Percobaan kedua harus berhasil di-commit');
        assert.equal(result.processedAttempt, 2);
    });

    test('4. Error permanen (Non-retryable) langsung dilempar tanpa membuang waktu retry', async () => {
        let attempts = 0;

        const mockPool = {
            async getConnection() {
                return {
                    async beginTransaction() {},
                    async commit() {},
                    async rollback() {},
                    release() {}
                };
            }
        };

        await assert.rejects(
            async () => {
                await executeWithRetry(mockPool, async () => {
                    attempts++;
                    const err = new Error('Duplicate entry for key PRIMARY');
                    err.code = 'ER_DUP_ENTRY';
                    throw err;
                });
            },
            /Duplicate entry/
        );

        assert.equal(attempts, 1, 'Tidak boleh melakukan retry jika bukan deadlock');
    });
});
