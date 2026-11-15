/**
 * SupplySync WMS - Database Resilience & Deadlock Auto-Retry Engine
 * Menangani ER_LOCK_DEADLOCK (1213) dan ER_LOCK_WAIT_TIMEOUT (1205)
 * dengan strategi Exponential Backoff dan Jitter untuk menjamin zero-drop transaksi.
 */

const RETRYABLE_ERRORS = [
    'ER_LOCK_DEADLOCK',
    'ER_LOCK_WAIT_TIMEOUT',
    1213, // MySQL error code untuk deadlock
    1205  // MySQL error code untuk lock wait timeout
];

/**
 * Mengecek apakah error database termasuk kategori yang dapat di-retry
 * @param {Error} error
 * @returns {boolean}
 */
function isRetryableError(error) {
    if (!error) return false;
    const code = error.code || error.errno;
    return RETRYABLE_ERRORS.includes(code) || 
           (typeof error.message === 'string' && error.message.toLowerCase().includes('deadlock'));
}

/**
 * Menjalankan fungsi transaksi dengan retry otomatis jika terjadi deadlock
 * @param {object} pool Pool database mysql2
 * @param {Function} transactionFn Fungsi yang menerima parameter `connection`
 * @param {number} maxRetries Jumlah maksimal percobaan (default: 3)
 * @param {number} baseDelayMs Delay dasar dalam milidetik (default: 50ms)
 * @returns {Promise<any>}
 */
async function executeWithRetry(pool, transactionFn, maxRetries = 3, baseDelayMs = 50) {
    let attempt = 0;

    while (attempt <= maxRetries) {
        attempt++;
        let connection;

        try {
            connection = await pool.getConnection();
            await connection.beginTransaction();

            const result = await transactionFn(connection);

            await connection.commit();
            return result;
        } catch (error) {
            if (connection) {
                try {
                    await connection.rollback();
                } catch (_) {}
            }

            if (isRetryableError(error) && attempt <= maxRetries) {
                // Jittered exponential backoff: baseDelay * 2^(attempt-1) + random(0, 30)
                const delay = (baseDelayMs * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 30);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            throw error;
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
}

module.exports = {
    isRetryableError,
    executeWithRetry
};
