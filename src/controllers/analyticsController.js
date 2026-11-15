const db = require('../config/database');

// 1. Ambil Ringkasan Metrik KPI & Valuasi Inventaris Gudang
exports.getKpiSummary = async (req, res) => {
    try {
        const { facility_id } = req.query;
        const userFacility = req.user && req.user.role === 'STAFF' ? req.user.facility_id : null;
        const targetFacility = userFacility || (facility_id ? parseInt(facility_id, 10) : null);

        let totalAssetValue = 0;
        let totalActiveUnits = 0;
        let totalActiveSkus = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;
        let totalBatches = 0;
        let freshBatches = 0;
        let warningBatches = 0;
        let expiredBatches = 0;
        let pendingTransfers = 0;
        let pendingPo = 0;
        let pendingSo = 0;
        let fastMoving = [];
        let recentActivities = [];

        try {
            // 1. Valuasi Aset Stok & Kuantitas Unit Aktif
            let valQuery = `
                SELECT 
                    COALESCE(SUM(b.quantity * COALESCE(p.cost_price, 0)), 0) AS total_asset_value,
                    COALESCE(SUM(b.quantity), 0) AS total_active_units
                FROM inventory_batches b
                JOIN products p ON b.product_id = p.product_id
                WHERE b.quantity > 0 AND p.is_active = 1
            `;
            const valParams = [];
            if (targetFacility) {
                valQuery += ` AND b.facility_id = ?`;
                valParams.push(targetFacility);
            }

            const [valRows] = await db.query(valQuery, valParams);
            if (valRows && valRows.length > 0) {
                totalAssetValue = parseFloat(valRows[0].total_asset_value) || 0;
                totalActiveUnits = parseInt(valRows[0].total_active_units, 10) || 0;
            }

            // 2. Status Kesehatan Batch & Expired Tiers
            let batchHealthQuery = `
                SELECT 
                    COUNT(*) AS total_batches,
                    SUM(CASE WHEN expired_date > DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS fresh_batches,
                    SUM(CASE WHEN expired_date >= CURDATE() AND expired_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS warning_batches,
                    SUM(CASE WHEN expired_date < CURDATE() THEN 1 ELSE 0 END) AS expired_batches
                FROM inventory_batches
                WHERE quantity > 0
            `;
            const batchParams = [];
            if (targetFacility) {
                batchHealthQuery += ` AND facility_id = ?`;
                batchParams.push(targetFacility);
            }

            const [batchHealthRows] = await db.query(batchHealthQuery, batchParams);
            if (batchHealthRows && batchHealthRows.length > 0) {
                totalBatches = parseInt(batchHealthRows[0].total_batches, 10) || 0;
                freshBatches = parseInt(batchHealthRows[0].fresh_batches, 10) || 0;
                warningBatches = parseInt(batchHealthRows[0].warning_batches, 10) || 0;
                expiredBatches = parseInt(batchHealthRows[0].expired_batches, 10) || 0;
            }

            // 3. Status Stok Produk (Safe, Low Stock, Out of Stock)
            let skuStatusQuery = `
                SELECT 
                    p.product_id,
                    p.min_stock,
                    COALESCE(SUM(CASE WHEN b.quantity > 0 THEN b.quantity ELSE 0 END), 0) AS current_stock
                FROM products p
                LEFT JOIN inventory_batches b ON p.product_id = b.product_id ${targetFacility ? 'AND b.facility_id = ?' : ''}
                WHERE p.is_active = 1
                GROUP BY p.product_id, p.min_stock
            `;
            const skuParams = targetFacility ? [targetFacility] : [];
            const [skuRows] = await db.query(skuStatusQuery, skuParams);

            totalActiveSkus = skuRows.length;
            skuRows.forEach(sku => {
                const stock = parseInt(sku.current_stock, 10);
                if (stock === 0) outOfStockCount++;
                else if (stock <= sku.min_stock) lowStockCount++;
            });

            // 4. Operasional Tertunda (Pending Transfers, PO, SO)
            const [transferCountRow] = await db.query(
                `SELECT COUNT(*) AS total FROM stock_transfers WHERE status = 'IN_TRANSIT' ${targetFacility ? 'AND (source_facility_id = ? OR destination_facility_id = ?)' : ''}`,
                targetFacility ? [targetFacility, targetFacility] : []
            );
            pendingTransfers = transferCountRow ? transferCountRow[0].total : 0;

            const [poCountRow] = await db.query(
                `SELECT COUNT(*) AS total FROM purchase_orders WHERE status IN ('DRAFT', 'APPROVED') ${targetFacility ? 'AND facility_id = ?' : ''}`,
                targetFacility ? [targetFacility] : []
            );
            pendingPo = poCountRow ? poCountRow[0].total : 0;

            const [soCountRow] = await db.query(
                `SELECT COUNT(*) AS total FROM sales_orders WHERE status IN ('DRAFT', 'CONFIRMED') ${targetFacility ? 'AND facility_id = ?' : ''}`,
                targetFacility ? [targetFacility] : []
            );
            pendingSo = soCountRow ? soCountRow[0].total : 0;

            // 5. Fast-Moving Products (Produk dengan pengeluaran tertinggi)
            let fastQuery = `
                SELECT 
                    p.product_id,
                    p.product_name,
                    p.unit,
                    COALESCE(SUM(t.quantity), 0) AS total_outflow
                FROM stock_transactions t
                JOIN products p ON t.product_id = p.product_id
                WHERE t.transaction_type = 'OUT'
            `;
            const fastParams = [];
            if (targetFacility) {
                fastQuery += ` AND t.facility_id = ?`;
                fastParams.push(targetFacility);
            }
            fastQuery += ` GROUP BY p.product_id, p.product_name, p.unit ORDER BY total_outflow DESC LIMIT 5;`;

            const [fastRows] = await db.query(fastQuery, fastParams);
            fastMoving = fastRows || [];

            // 6. Mutasi Terkini (Recent Activities)
            let actQuery = `
                SELECT t.transaction_id, t.reference_no, t.transaction_type, t.quantity, t.created_at,
                       p.product_name, p.product_id, u.full_name AS operator
                FROM stock_transactions t
                JOIN products p ON t.product_id = p.product_id
                LEFT JOIN users u ON t.user_id = u.user_id
            `;
            const actParams = [];
            if (targetFacility) {
                actQuery += ` WHERE t.facility_id = ?`;
                actParams.push(targetFacility);
            }
            actQuery += ` ORDER BY t.created_at DESC LIMIT 5;`;
            const [actRows] = await db.query(actQuery, actParams);
            recentActivities = actRows || [];

        } catch (dbErr) {
            console.warn('⚠️ Gagal kueri metrik KPI ke database MySQL:', dbErr.message);
        }

        const healthScore = totalBatches > 0 
            ? Math.round(((freshBatches + warningBatches) / totalBatches) * 100) 
            : 100;

        res.json({
            status: 'Success',
            data: {
                total_asset_value: totalAssetValue,
                formatted_asset_value: new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(totalAssetValue),
                total_active_units: totalActiveUnits,
                total_active_skus: totalActiveSkus,
                low_stock_count: lowStockCount,
                out_of_stock_count: outOfStockCount,
                freshness_health_score: healthScore,
                total_batches: totalBatches,
                fresh_batches: freshBatches,
                warning_batches: warningBatches,
                expired_batches: expiredBatches,
                pending_transfers: pendingTransfers,
                pending_purchase_orders: pendingPo,
                pending_sales_orders: pendingSo,
                fast_moving_products: fastMoving,
                recent_activities: recentActivities
            }
        });

    } catch (error) {
        console.error('❌ Error getKpiSummary:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};
