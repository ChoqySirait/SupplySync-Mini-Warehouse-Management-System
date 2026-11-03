const db = require('../config/database');

/**
 * SupplySync WMS - Inventory Reporting & Stock Card Ledger
 */

/**
 * 1. Ambil Laporan Kartu Stok (Stock Card Ledger) per SKU
 * Menghitung Saldo Awal, Mutasi Debit/Kredit, dan Saldo Akhir Berjalan
 */
exports.getStockCardReport = async (req, res) => {
    try {
        const { product_id, start_date, end_date } = req.query;

        if (!product_id) {
            return res.status(400).json({
                status: 'Error',
                message: 'Parameter product_id wajib disertakan.'
            });
        }

        // 1. Ambil data master produk
        const [products] = await db.query(
            `SELECT product_id, product_name, category, unit, min_stock, cost_price, description 
             FROM products 
             WHERE product_id = ?`,
            [product_id]
        );

        if (!products || products.length === 0) {
            return res.status(404).json({
                status: 'Error',
                message: `Produk dengan SKU '${product_id}' tidak ditemukan.`
            });
        }

        const product = products[0];

        // 2. Hitung Saldo Awal (Beginning Balance) sebelum start_date
        let beginningBalance = 0;
        if (start_date) {
            const [priorRows] = await db.query(
                `SELECT transaction_type, quantity, notes 
                 FROM stock_transactions 
                 WHERE product_id = ? AND created_at < ?`,
                [product_id, `${start_date} 00:00:00`]
            );

            priorRows.forEach(row => {
                const qty = parseInt(row.quantity, 10) || 0;
                if (row.transaction_type === 'IN') {
                    beginningBalance += qty;
                } else if (row.transaction_type === 'OUT' || row.transaction_type === 'DISPOSAL') {
                    beginningBalance -= qty;
                } else if (row.transaction_type === 'ADJUSTMENT') {
                    const isSurplus = row.notes && (row.notes.includes('SURPLUS') || row.notes.includes('+'));
                    if (isSurplus) beginningBalance += qty;
                    else beginningBalance -= qty;
                }
            });
        }

        // 3. Ambil seluruh transaksi dalam periode yang ditentukan
        let query = `
            SELECT 
                t.transaction_id,
                t.reference_no,
                t.transaction_type,
                t.quantity,
                t.notes,
                t.created_at,
                u.full_name AS operator
            FROM stock_transactions t
            LEFT JOIN users u ON t.user_id = u.user_id
            WHERE t.product_id = ?
        `;
        const params = [product_id];

        if (start_date) {
            query += ` AND t.created_at >= ?`;
            params.push(`${start_date} 00:00:00`);
        }

        if (end_date) {
            query += ` AND t.created_at <= ?`;
            params.push(`${end_date} 23:59:59`);
        }

        query += ` ORDER BY t.created_at ASC, t.transaction_id ASC`;

        const [trxRows] = await db.query(query, params);

        // 4. Kalkulasi saldo berjalan (Running Balance Ledger)
        let runningBalance = beginningBalance;
        let totalIn = 0;
        let totalOut = 0;
        let totalDisposal = 0;
        let totalAdjustment = 0;

        const movements = trxRows.map(row => {
            const qty = parseInt(row.quantity, 10) || 0;
            let inQty = 0;
            let outQty = 0;

            if (row.transaction_type === 'IN') {
                inQty = qty;
                runningBalance += inQty;
                totalIn += inQty;
            } else if (row.transaction_type === 'OUT') {
                outQty = qty;
                runningBalance -= outQty;
                totalOut += outQty;
            } else if (row.transaction_type === 'DISPOSAL') {
                outQty = qty;
                runningBalance -= outQty;
                totalDisposal += outQty;
            } else if (row.transaction_type === 'ADJUSTMENT') {
                const isSurplus = row.notes && (row.notes.includes('SURPLUS') || row.notes.includes('+'));
                if (isSurplus) {
                    inQty = qty;
                    runningBalance += inQty;
                    totalAdjustment += inQty;
                } else {
                    outQty = qty;
                    runningBalance -= outQty;
                    totalAdjustment -= outQty;
                }
            }

            return {
                transaction_id: row.transaction_id,
                reference_no: row.reference_no || `#TRX-${row.transaction_id}`,
                transaction_type: row.transaction_type,
                in_quantity: inQty,
                out_quantity: outQty,
                balance_after: runningBalance,
                operator: row.operator || 'Sistem',
                notes: row.notes || '-',
                created_at: row.created_at
            };
        });

        res.json({
            status: 'Success',
            data: {
                product,
                period: {
                    start_date: start_date || null,
                    end_date: end_date || new Date().toISOString().split('T')[0]
                },
                beginning_balance: beginningBalance,
                ending_balance: runningBalance,
                summary: {
                    total_in: totalIn,
                    total_out: totalOut,
                    total_disposal: totalDisposal,
                    net_adjustment: totalAdjustment,
                    net_change: runningBalance - beginningBalance
                },
                movements
            }
        });

    } catch (error) {
        console.error('❌ Error getStockCardReport:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};
