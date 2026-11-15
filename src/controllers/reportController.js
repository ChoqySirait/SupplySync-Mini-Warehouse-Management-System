const db = require('../config/database');
const { serializeToCsv } = require('../utils/csvParser');

/**
 * SupplySync WMS - Enterprise Reporting, Analytics & Ledger Service
 */

// 1. Laporan Kartu Stok (Stock Card Ledger) per SKU
exports.getStockCardReport = async (req, res) => {
    try {
        const { product_id, start_date, end_date, facility_id, format } = req.query;

        if (!product_id) {
            return res.status(400).json({
                status: 'Error',
                message: 'Parameter product_id wajib disertakan.'
            });
        }

        const userFacility = req.user && req.user.role === 'STAFF' ? req.user.facility_id : null;
        const targetFacility = userFacility || (facility_id ? parseInt(facility_id, 10) : null);

        // 1. Ambil data master produk
        const [products] = await db.query(
            `SELECT p.product_id, p.product_name, p.category, p.unit, p.min_stock, p.cost_price, p.description 
             FROM products p
             WHERE p.product_id = ?`,
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
            let priorQuery = `
                SELECT transaction_type, quantity, notes 
                FROM stock_transactions 
                WHERE product_id = ? AND created_at < ?
            `;
            const priorParams = [product_id, `${start_date} 00:00:00`];
            if (targetFacility) {
                priorQuery += ` AND facility_id = ?`;
                priorParams.push(targetFacility);
            }

            const [priorRows] = await db.query(priorQuery, priorParams);

            priorRows.forEach(row => {
                const qty = parseInt(row.quantity, 10) || 0;
                if (row.transaction_type === 'IN' || row.transaction_type === 'TRANSFER_IN') {
                    beginningBalance += qty;
                } else if (row.transaction_type === 'OUT' || row.transaction_type === 'DISPOSAL' || row.transaction_type === 'TRANSFER_OUT') {
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
                t.facility_id,
                f.facility_code,
                f.facility_name,
                t.transaction_type,
                t.quantity,
                t.notes,
                t.created_at,
                u.full_name AS operator
            FROM stock_transactions t
            LEFT JOIN warehouse_facilities f ON t.facility_id = f.facility_id
            LEFT JOIN users u ON t.user_id = u.user_id
            WHERE t.product_id = ?
        `;
        const params = [product_id];

        if (targetFacility) {
            query += ` AND t.facility_id = ?`;
            params.push(targetFacility);
        }

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

        const ledger = trxRows.map(trx => {
            const qty = parseInt(trx.quantity, 10);
            let inQty = 0;
            let outQty = 0;

            if (trx.transaction_type === 'IN' || trx.transaction_type === 'TRANSFER_IN') {
                inQty = qty;
                runningBalance += qty;
                totalIn += qty;
            } else if (trx.transaction_type === 'OUT' || trx.transaction_type === 'DISPOSAL' || trx.transaction_type === 'TRANSFER_OUT') {
                outQty = qty;
                runningBalance -= qty;
                if (trx.transaction_type === 'DISPOSAL') totalDisposal += qty;
                else totalOut += qty;
            } else if (trx.transaction_type === 'ADJUSTMENT') {
                const isSurplus = trx.notes && (trx.notes.includes('SURPLUS') || trx.notes.includes('+'));
                if (isSurplus) {
                    inQty = qty;
                    runningBalance += qty;
                    totalAdjustment += qty;
                } else {
                    outQty = qty;
                    runningBalance -= qty;
                    totalAdjustment -= qty;
                }
            }

            return {
                transaction_id: trx.transaction_id,
                reference_no: trx.reference_no,
                date: trx.created_at,
                facility_code: trx.facility_code || 'WH-JKT-01',
                transaction_type: trx.transaction_type,
                in_quantity: inQty,
                out_quantity: outQty,
                balance: runningBalance,
                operator: trx.operator || 'Sistem',
                notes: trx.notes
            };
        });

        // Ekspor format CSV jika diminta
        if (format === 'csv') {
            const csvRows = ledger.map(item => ({
                'No Referensi': item.reference_no,
                'Tanggal': new Date(item.date).toISOString().replace('T', ' ').slice(0, 19),
                'Fasilitas': item.facility_code,
                'Tipe': item.transaction_type,
                'Masuk': item.in_quantity,
                'Keluar': item.out_quantity,
                'Saldo': item.balance,
                'Operator': item.operator,
                'Keterangan': item.notes
            }));
            const csvOutput = serializeToCsv(csvRows);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="StockCard_${product_id}_${Date.now()}.csv"`);
            return res.send(csvOutput);
        }

        return res.json({
            status: 'Success',
            data: {
                product: {
                    product_id: product.product_id,
                    product_name: product.product_name,
                    category: product.category,
                    unit: product.unit,
                    min_stock: product.min_stock,
                    cost_price: parseFloat(product.cost_price) || 0.00
                },
                period: {
                    start_date: start_date || 'Awal Sistem',
                    end_date: end_date || 'Saat Ini'
                },
                summary: {
                    beginning_balance: beginningBalance,
                    total_in: totalIn,
                    total_out: totalOut,
                    total_disposal: totalDisposal,
                    net_adjustment: totalAdjustment,
                    ending_balance: runningBalance,
                    total_asset_value: runningBalance * (parseFloat(product.cost_price) || 0)
                },
                ledger
            }
        });

    } catch (error) {
        console.error('❌ Error getStockCardReport:', error.message);
        return res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 2. Laporan Valuasi Inventaris (Inventory Asset Valuation)
exports.getValuationReport = async (req, res) => {
    try {
        const { facility_id, format } = req.query;
        const userFacility = req.user && req.user.role === 'STAFF' ? req.user.facility_id : null;
        const targetFacility = userFacility || (facility_id ? parseInt(facility_id, 10) : null);

        let query = `
            SELECT 
                p.product_id,
                p.product_name,
                p.category,
                p.unit,
                p.cost_price,
                COALESCE(SUM(b.quantity), 0) AS total_stock,
                (COALESCE(SUM(b.quantity), 0) * COALESCE(p.cost_price, 0)) AS asset_value,
                COUNT(b.batch_id) AS batch_count
            FROM products p
            LEFT JOIN inventory_batches b ON p.product_id = b.product_id AND b.quantity > 0
                ${targetFacility ? 'AND b.facility_id = ?' : ''}
            WHERE p.is_active = 1
            GROUP BY p.product_id, p.product_name, p.category, p.unit, p.cost_price
            ORDER BY asset_value DESC;
        `;
        const params = targetFacility ? [targetFacility] : [];

        const [rows] = await db.query(query, params);

        const totalValuation = rows.reduce((sum, r) => sum + parseFloat(r.asset_value), 0);
        const totalUnits = rows.reduce((sum, r) => sum + parseInt(r.total_stock, 10), 0);

        if (format === 'csv') {
            const csvRows = rows.map(r => ({
                'ID SKU': r.product_id,
                'Nama Produk': r.product_name,
                'Kategori': r.category,
                'Satuan': r.unit,
                'Harga Pokok': r.cost_price,
                'Total Stok': r.total_stock,
                'Valuasi Aset': r.asset_value
            }));
            const csvOutput = serializeToCsv(csvRows);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="InventoryValuation_${Date.now()}.csv"`);
            return res.send(csvOutput);
        }

        res.json({
            status: 'Success',
            total_valuation: totalValuation,
            total_units: totalUnits,
            data: rows
        });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 3. Laporan Mutasi Barang Masuk & Keluar (Inbound / Outbound Report)
exports.getInboundOutboundReport = async (req, res) => {
    try {
        const { start_date, end_date, facility_id, format } = req.query;
        const userFacility = req.user && req.user.role === 'STAFF' ? req.user.facility_id : null;
        const targetFacility = userFacility || (facility_id ? parseInt(facility_id, 10) : null);

        let query = `
            SELECT 
                t.transaction_id,
                t.reference_no,
                t.created_at,
                t.transaction_type,
                t.product_id,
                p.product_name,
                p.unit,
                t.quantity,
                f.facility_code,
                f.facility_name,
                u.full_name AS operator,
                t.notes
            FROM stock_transactions t
            JOIN products p ON t.product_id = p.product_id
            JOIN warehouse_facilities f ON t.facility_id = f.facility_id
            LEFT JOIN users u ON t.user_id = u.user_id
            WHERE 1=1
        `;
        const params = [];

        if (targetFacility) {
            query += ` AND t.facility_id = ?`;
            params.push(targetFacility);
        }

        if (start_date) {
            query += ` AND t.created_at >= ?`;
            params.push(`${start_date} 00:00:00`);
        }

        if (end_date) {
            query += ` AND t.created_at <= ?`;
            params.push(`${end_date} 23:59:59`);
        }

        query += ` ORDER BY t.created_at DESC LIMIT 1000;`;

        const [rows] = await db.query(query, params);

        if (format === 'csv') {
            const csvRows = rows.map(r => ({
                'No Referensi': r.reference_no,
                'Tanggal': new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19),
                'Tipe': r.transaction_type,
                'SKU': r.product_id,
                'Nama Produk': r.product_name,
                'Jumlah': r.quantity,
                'Satuan': r.unit,
                'Fasilitas': r.facility_name,
                'Operator': r.operator || 'Sistem',
                'Keterangan': r.notes
            }));
            const csvOutput = serializeToCsv(csvRows);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="StockMutations_${Date.now()}.csv"`);
            return res.send(csvOutput);
        }

        res.json({
            status: 'Success',
            count: rows.length,
            data: rows
        });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

// 4. Laporan Kedaluwarsa Batch (Batch Expiry Report)
exports.getBatchExpiryReport = async (req, res) => {
    try {
        const { facility_id, format } = req.query;
        const userFacility = req.user && req.user.role === 'STAFF' ? req.user.facility_id : null;
        const targetFacility = userFacility || (facility_id ? parseInt(facility_id, 10) : null);

        let query = `
            SELECT 
                b.batch_id,
                b.batch_code,
                b.product_id,
                p.product_name,
                p.unit,
                b.facility_id,
                f.facility_name,
                f.facility_code,
                b.quantity,
                b.expired_date,
                b.received_date,
                COALESCE(l.location_code, 'A-01-01') AS location_code,
                DATEDIFF(b.expired_date, CURDATE()) AS days_until_expiration,
                CASE 
                    WHEN b.expired_date < CURDATE() THEN 'EXPIRED'
                    WHEN DATEDIFF(b.expired_date, CURDATE()) <= 30 THEN 'CRITICAL (<= 30 Hari)'
                    WHEN DATEDIFF(b.expired_date, CURDATE()) <= 90 THEN 'WARNING (31 - 90 Hari)'
                    ELSE 'HEALTHY (> 90 Hari)'
                END AS expiry_category
            FROM inventory_batches b
            JOIN products p ON b.product_id = p.product_id
            JOIN warehouse_facilities f ON b.facility_id = f.facility_id
            LEFT JOIN warehouse_locations l ON b.location_id = l.location_id
            WHERE b.quantity > 0
        `;
        const params = [];

        if (targetFacility) {
            query += ` AND b.facility_id = ?`;
            params.push(targetFacility);
        }

        query += ` ORDER BY b.expired_date ASC;`;

        const [rows] = await db.query(query, params);

        if (format === 'csv') {
            const csvRows = rows.map(r => ({
                'Batch ID': r.batch_id,
                'Kode Batch': r.batch_code,
                'SKU': r.product_id,
                'Nama Produk': r.product_name,
                'Jumlah': r.quantity,
                'Fasilitas': r.facility_name,
                'Lokasi Rak': r.location_code,
                'Tanggal Expired': r.expired_date ? r.expired_date.toISOString().split('T')[0] : '-',
                'Sisa Hari': r.days_until_expiration,
                'Kategori': r.expiry_category
            }));
            const csvOutput = serializeToCsv(csvRows);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="BatchExpiryReport_${Date.now()}.csv"`);
            return res.send(csvOutput);
        }

        res.json({
            status: 'Success',
            count: rows.length,
            data: rows
        });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
};
