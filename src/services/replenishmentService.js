const db = require('../config/database');
const orderService = require('./orderService');

/**
 * SupplySync WMS - Intelligent Replenishment & Batch Aging Analytics Engine
 * Menghitung ambang batas pemesanan ulang (Reorder Point & EOQ),
 * mitigasi risiko kehabisan stok (Stockout Predictor),
 * serta kategorisasi umur simpan batch (Shelf-Life Freshness Tiers).
 */

// ====================================================================
// 1. PURE COMPUTATION & UTILITY FUNCTIONS
// ====================================================================

/**
 * Hitung rekomendasi kuantitas reorder berbasis Min-Max Inventory Policy
 * @param {Object} params
 * @param {number} params.totalStock
 * @param {number} params.minStock
 * @param {number} params.reorderQuantity
 * @param {number} params.onOrderQty
 * @returns {{ targetStock: number, deficit: number, recommendedQty: number, reorderStatus: string }}
 */
function calculateReorderRecommendation({ totalStock, minStock, reorderQuantity = 0, onOrderQty = 0 }) {
    const currentStock = Math.max(0, parseInt(totalStock, 10) || 0);
    const minThreshold = Math.max(0, parseInt(minStock, 10) || 0);
    const configuredReorder = Math.max(0, parseInt(reorderQuantity, 10) || 0);
    const onOrder = Math.max(0, parseInt(onOrderQty, 10) || 0);

    // Target stock: jika reorderQuantity ditentukan, target = minStock + reorderQuantity
    // Jika tidak, default Min-Max WMS target = minStock * 2
    const targetStock = configuredReorder > 0 
        ? minThreshold + configuredReorder 
        : (minThreshold * 2);

    const netAvailable = currentStock + onOrder;
    const grossDeficit = Math.max(0, targetStock - currentStock);
    const netDeficit = Math.max(0, targetStock - netAvailable);

    let reorderStatus = 'HEALTHY';
    let recommendedQty = 0;

    if (currentStock === 0) {
        if (onOrder >= targetStock) {
            reorderStatus = 'PO_IN_PIPELINE';
            recommendedQty = 0;
        } else {
            reorderStatus = 'OUT_OF_STOCK';
            recommendedQty = netDeficit > 0 ? netDeficit : grossDeficit;
        }
    } else if (currentStock <= minThreshold) {
        if (onOrder >= grossDeficit) {
            reorderStatus = 'PO_IN_PIPELINE';
            recommendedQty = 0;
        } else {
            reorderStatus = 'REORDER_REQUIRED';
            recommendedQty = netDeficit > 0 ? netDeficit : (grossDeficit - onOrder);
        }
    }

    return {
        targetStock,
        grossDeficit,
        netDeficit,
        recommendedQty: Math.max(0, recommendedQty),
        reorderStatus
    };
}

/**
 * Prediksi risiko kehabisan stok berbasis laju konsumsi harian (Burn Rate) vs Lead Time Pemasok
 * @param {Object} params
 * @param {number} params.totalStock
 * @param {number} params.dailyBurnRate
 * @param {number} params.leadTimeDays
 * @returns {{ daysToStockout: number|null, stockoutRisk: string, burnRate: number }}
 */
function predictStockoutRisk({ totalStock, dailyBurnRate = 0, leadTimeDays = 7 }) {
    const currentStock = Math.max(0, parseInt(totalStock, 10) || 0);
    const burnRate = Math.max(0, parseFloat(dailyBurnRate) || 0);
    const leadTime = Math.max(1, parseInt(leadTimeDays, 10) || 7);

    if (currentStock === 0) {
        return {
            daysToStockout: 0,
            stockoutRisk: 'CRITICAL',
            burnRate
        };
    }

    if (burnRate <= 0) {
        return {
            daysToStockout: null,
            stockoutRisk: 'LOW',
            burnRate: 0
        };
    }

    const daysToStockout = Math.round(currentStock / burnRate);

    let stockoutRisk = 'LOW';
    if (daysToStockout <= leadTime) {
        // Stok habis sebelum pasokan baru tiba dari pabrik
        stockoutRisk = 'CRITICAL';
    } else if (daysToStockout <= (leadTime * 2)) {
        // Stok kritis mendekati lead time
        stockoutRisk = 'HIGH';
    } else if (daysToStockout <= (leadTime * 3)) {
        stockoutRisk = 'MEDIUM';
    }

    return {
        daysToStockout,
        stockoutRisk,
        burnRate: Math.round(burnRate * 100) / 100
    };
}

/**
 * Klasifikasi kategori penuaan batch berdasarkan sisa umur simpan (Days Until Expiry)
 * @param {number} daysUntilExpiry
 * @returns {'EXPIRED'|'CRITICAL'|'WARNING'|'HEALTHY'}
 */
function classifyBatchAgingTier(daysUntilExpiry) {
    const days = parseInt(daysUntilExpiry, 10);
    if (isNaN(days) || days <= 0) {
        return 'EXPIRED';
    }
    if (days <= 30) {
        return 'CRITICAL';
    }
    if (days <= 90) {
        return 'WARNING';
    }
    return 'HEALTHY';
}

// ====================================================================
// 2. REPLENISHMENT ALERTS & PURCHASE ORDER GENERATION
// ====================================================================

/**
 * Mengambil daftar seluruh produk yang memerlukan pemesanan ulang (Restock Alerts)
 * @param {Object} filters
 * @param {number} [filters.facility_id]
 * @returns {Promise<{ alerts: Array, summary: Object }>}
 */
async function getReplenishmentAlerts(filters = {}) {
    const facilityId = filters.facility_id ? parseInt(filters.facility_id, 10) : null;

    // 1. Ambil master produk aktif dan stok fisik saat ini (opsional scoped ke fasilitas)
    let stockQuery = `
        SELECT 
            p.product_id,
            p.product_name,
            p.category,
            p.unit,
            p.min_stock,
            COALESCE(p.reorder_quantity, 0) AS reorder_quantity,
            COALESCE(p.cost_price, 0) AS cost_price,
            COALESCE(SUM(CASE WHEN b.quantity > 0 THEN b.quantity ELSE 0 END), 0) AS total_stock
        FROM products p
        LEFT JOIN inventory_batches b ON p.product_id = b.product_id
    `;
    const stockParams = [];

    if (facilityId) {
        stockQuery += `
            LEFT JOIN warehouse_locations l ON b.location_id = l.location_id
            WHERE p.is_active = 1 AND (l.facility_id = ? OR b.batch_id IS NULL)
        `;
        stockParams.push(facilityId);
    } else {
        stockQuery += ` WHERE p.is_active = 1 `;
    }

    stockQuery += `
        GROUP BY p.product_id, p.product_name, p.category, p.unit, p.min_stock, p.reorder_quantity, p.cost_price
        ORDER BY p.product_name ASC
    `;

    const [products] = await db.query(stockQuery, stockParams);

    // 2. Ambil kuantitas yang sedang dalam pemesanan (On-Order) dari PO aktif (DRAFT, APPROVED, PARTIALLY_RECEIVED)
    let poQuery = `
        SELECT 
            poi.product_id,
            COALESCE(SUM(poi.ordered_quantity - poi.received_quantity), 0) AS on_order_qty
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.po_id = po.po_id
        WHERE po.status IN ('DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED')
    `;
    const poParams = [];
    if (facilityId) {
        poQuery += ` AND po.facility_id = ?`;
        poParams.push(facilityId);
    }
    poQuery += ` GROUP BY poi.product_id`;

    const [poRows] = await db.query(poQuery, poParams);
    const onOrderMap = new Map();
    for (const r of poRows) {
        onOrderMap.set(r.product_id, parseInt(r.on_order_qty, 10) || 0);
    }

    // 3. Ambil laju konsumsi barang keluar 30 hari terakhir (Daily Burn Rate)
    const [burnRateRows] = await db.query(`
        SELECT 
            t.product_id,
            COALESCE(SUM(t.quantity), 0) / 30.0 AS daily_burn_rate
        FROM stock_transactions t
        WHERE t.transaction_type IN ('OUT', 'TRANSFER_OUT')
          AND t.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY t.product_id
    `);
    const burnRateMap = new Map();
    for (const b of burnRateRows) {
        burnRateMap.set(b.product_id, parseFloat(b.daily_burn_rate) || 0);
    }

    // 4. Ambil preferensi pemasok untuk setiap produk
    // Urutan prioritas: Supplier dari batch penerimaan terakhir -> Supplier default aktif
    const [lastSuppliers] = await db.query(`
        SELECT b1.product_id, b1.supplier_id, s.supplier_name, s.supplier_code, COALESCE(s.lead_time_days, 7) AS lead_time_days
        FROM inventory_batches b1
        JOIN suppliers s ON b1.supplier_id = s.supplier_id
        WHERE b1.batch_id IN (
            SELECT MAX(b2.batch_id) 
            FROM inventory_batches b2 
            WHERE b2.supplier_id IS NOT NULL 
            GROUP BY b2.product_id
        )
    `);
    const supplierMap = new Map();
    for (const s of lastSuppliers) {
        supplierMap.set(s.product_id, {
            supplier_id: s.supplier_id,
            supplier_name: s.supplier_name,
            supplier_code: s.supplier_code,
            lead_time_days: parseInt(s.lead_time_days, 10) || 7
        });
    }

    // Fallback supplier jika produk belum pernah diterima dari batch
    const [fallbackSuppliers] = await db.query(`
        SELECT supplier_id, supplier_name, supplier_code, COALESCE(lead_time_days, 7) AS lead_time_days 
        FROM suppliers 
        WHERE is_active = 1 
        ORDER BY supplier_id ASC 
        LIMIT 1
    `);
    const defaultSupplier = fallbackSuppliers && fallbackSuppliers.length > 0 ? {
        supplier_id: fallbackSuppliers[0].supplier_id,
        supplier_name: fallbackSuppliers[0].supplier_name,
        supplier_code: fallbackSuppliers[0].supplier_code,
        lead_time_days: parseInt(fallbackSuppliers[0].lead_time_days, 10) || 7
    } : {
        supplier_id: 1,
        supplier_name: 'Pemasok Utama Gudang',
        supplier_code: 'SUP-DEFAULT',
        lead_time_days: 7
    };

    // 5. Kalkulasi seluruh item
    const alerts = [];
    let totalMonitored = products.length;
    let totalLowStock = 0;
    let totalPoInPipeline = 0;
    let totalCriticalStockout = 0;
    let estimatedReorderBudget = 0;

    for (const prod of products) {
        const totalStock = parseInt(prod.total_stock, 10) || 0;
        const minStock = parseInt(prod.min_stock, 10) || 0;
        const reorderQuantity = parseInt(prod.reorder_quantity, 10) || 0;
        const costPrice = parseFloat(prod.cost_price) || 0;
        const onOrderQty = onOrderMap.get(prod.product_id) || 0;
        const dailyBurnRate = burnRateMap.get(prod.product_id) || 0;

        const preferredSupplier = supplierMap.get(prod.product_id) || defaultSupplier;

        const reorderCalc = calculateReorderRecommendation({
            totalStock,
            minStock,
            reorderQuantity,
            onOrderQty
        });

        const stockoutPred = predictStockoutRisk({
            totalStock,
            dailyBurnRate,
            leadTimeDays: preferredSupplier.lead_time_days
        });

        const isLow = totalStock <= minStock;
        if (isLow) totalLowStock++;
        if (reorderCalc.reorderStatus === 'PO_IN_PIPELINE') totalPoInPipeline++;
        if (stockoutPred.stockoutRisk === 'CRITICAL') totalCriticalStockout++;

        const estimatedCost = reorderCalc.recommendedQty * costPrice;
        estimatedReorderBudget += estimatedCost;

        alerts.push({
            product_id: prod.product_id,
            product_name: prod.product_name,
            category: prod.category,
            unit: prod.unit,
            total_stock: totalStock,
            min_stock: minStock,
            on_order_qty: onOrderQty,
            target_stock: reorderCalc.targetStock,
            recommended_reorder_qty: reorderCalc.recommendedQty,
            reorder_status: reorderCalc.reorderStatus,
            cost_price: costPrice,
            estimated_reorder_cost: estimatedCost,
            formatted_cost: new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(estimatedCost),
            preferred_supplier: preferredSupplier,
            daily_burn_rate: stockoutPred.burnRate,
            days_to_stockout: stockoutPred.daysToStockout,
            stockout_risk: stockoutPred.stockoutRisk,
            is_low_stock: isLow
        });
    }

    // Urutkan alert: Yang butuh tindakan segera (OUT_OF_STOCK & REORDER_REQUIRED) di atas,
    // lalu urutkan berdasarkan deficit kuantitas terbesar
    alerts.sort((a, b) => {
        const priorityOrder = { 'OUT_OF_STOCK': 1, 'REORDER_REQUIRED': 2, 'PO_IN_PIPELINE': 3, 'HEALTHY': 4 };
        const pDiff = (priorityOrder[a.reorder_status] || 5) - (priorityOrder[b.reorder_status] || 5);
        if (pDiff !== 0) return pDiff;
        return b.recommended_reorder_qty - a.recommended_reorder_qty;
    });

    return {
        summary: {
            total_monitored: totalMonitored,
            total_low_stock: totalLowStock,
            total_po_in_pipeline: totalPoInPipeline,
            total_critical_stockout: totalCriticalStockout,
            estimated_reorder_budget: estimatedReorderBudget,
            formatted_reorder_budget: new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(estimatedReorderBudget)
        },
        alerts
    };
}

/**
 * 1-Click Pembangkitan Draft Purchase Order otomatis dari pemicu replenishment
 * @param {Object} params
 * @param {string} params.product_id
 * @param {number} [params.facility_id=1]
 * @param {number} [params.supplier_id]
 * @param {number} [params.quantity]
 * @param {number} [params.user_id=1]
 * @returns {Promise<Object>}
 */
async function generateReorderPurchaseOrder({
    product_id,
    facility_id = 1,
    supplier_id,
    quantity,
    user_id = 1
}) {
    if (!product_id) {
        throw new Error('ID Produk (SKU) wajib ditentukan untuk membuat pesanan reorder.');
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // 1. Ambil info produk
        const [prodRows] = await connection.query(
            `SELECT product_id, product_name, min_stock, cost_price, reorder_quantity FROM products WHERE product_id = ? FOR UPDATE`,
            [product_id]
        );
        if (!prodRows || prodRows.length === 0) {
            throw new Error(`Produk '${product_id}' tidak ditemukan di database.`);
        }
        const product = prodRows[0];

        // 2. Ambil stok saat ini
        const [stockRows] = await connection.query(
            `SELECT COALESCE(SUM(quantity), 0) AS current_stock FROM inventory_batches WHERE product_id = ? AND quantity > 0`,
            [product_id]
        );
        const currentStock = stockRows && stockRows.length > 0 ? parseInt(stockRows[0].current_stock, 10) : 0;

        // 3. Tentukan kuantitas pesan
        let orderQty = quantity ? parseInt(quantity, 10) : 0;
        if (orderQty <= 0) {
            const recommendation = calculateReorderRecommendation({
                totalStock: currentStock,
                minStock: product.min_stock,
                reorderQuantity: product.reorder_quantity || 0,
                onOrderQty: 0
            });
            orderQty = recommendation.recommendedQty > 0 
                ? recommendation.recommendedQty 
                : Math.max(10, product.min_stock);
        }

        // 4. Tentukan supplier
        let finalSupplierId = supplier_id ? parseInt(supplier_id, 10) : null;
        if (!finalSupplierId) {
            const [lastBatch] = await connection.query(
                `SELECT supplier_id FROM inventory_batches WHERE product_id = ? AND supplier_id IS NOT NULL ORDER BY batch_id DESC LIMIT 1`,
                [product_id]
            );
            if (lastBatch && lastBatch.length > 0) {
                finalSupplierId = lastBatch[0].supplier_id;
            } else {
                const [firstSupplier] = await connection.query(
                    `SELECT supplier_id FROM suppliers WHERE is_active = 1 LIMIT 1`
                );
                finalSupplierId = firstSupplier && firstSupplier.length > 0 ? firstSupplier[0].supplier_id : 1;
            }
        }

        // 5. Buat Purchase Order formal menggunakan orderService
        const poPayload = {
            supplier_id: finalSupplierId,
            facility_id: facility_id || 1,
            items: [
                {
                    product_id: product.product_id,
                    ordered_quantity: orderQty,
                    unit_cost: parseFloat(product.cost_price) || 0
                }
            ],
            notes: `Auto-generated dari Intelligent Replenishment Engine (Stok saat reorder: ${currentStock}, Min: ${product.min_stock}).`,
            user_id: user_id || 1
        };

        const createdPo = await orderService.createPurchaseOrder(connection, poPayload);
        await connection.commit();

        return {
            ...createdPo,
            product_id: product.product_id,
            product_name: product.product_name,
            ordered_quantity: orderQty,
            current_stock_at_trigger: currentStock
        };
    } catch (error) {
        if (connection) await connection.rollback();
        throw error;
    } finally {
        if (connection) connection.release();
    }
}

/**
 * Pembangkitan Masal (Bulk) Draft Purchase Order dikelompokkan per Pemasok (Consolidated POs)
 * @param {Object} params
 * @param {number} [params.facility_id=1]
 * @param {Array<{product_id: string, quantity?: number, supplier_id?: number}>} [params.items]
 * @param {number} [params.user_id=1]
 * @returns {Promise<{ count: number, purchase_orders: Array }>}
 */
async function generateBulkReorderPurchaseOrders({
    facility_id = 1,
    items = null,
    user_id = 1
}) {
    let reorderList = items;

    // Jika items tidak dikirim, otomatis ambil seluruh item berstatus REORDER_REQUIRED atau OUT_OF_STOCK
    if (!reorderList || !Array.isArray(reorderList) || reorderList.length === 0) {
        const alertResult = await getReplenishmentAlerts({ facility_id });
        reorderList = alertResult.alerts
            .filter(a => (a.reorder_status === 'REORDER_REQUIRED' || a.reorder_status === 'OUT_OF_STOCK') && a.recommended_reorder_qty > 0)
            .map(a => ({
                product_id: a.product_id,
                quantity: a.recommended_reorder_qty,
                supplier_id: a.preferred_supplier ? a.preferred_supplier.supplier_id : null,
                unit_cost: a.cost_price
            }));
    }

    if (reorderList.length === 0) {
        return {
            count: 0,
            message: 'Tidak ada produk di bawah ambang batas yang membutuhkan pembuatan Draft PO saat ini.',
            purchase_orders: []
        };
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        // 1. Dapatkan supplier fallback
        const [defaultSuppliers] = await connection.query(
            `SELECT supplier_id FROM suppliers WHERE is_active = 1 LIMIT 1`
        );
        const fallbackSupplierId = defaultSuppliers.length > 0 ? defaultSuppliers[0].supplier_id : 1;

        // 2. Kelompokkan item berdasarkan supplier_id
        const groupedBySupplier = new Map();

        for (const it of reorderList) {
            let supplierId = it.supplier_id ? parseInt(it.supplier_id, 10) : null;
            if (!supplierId) {
                const [lastBatch] = await connection.query(
                    `SELECT supplier_id FROM inventory_batches WHERE product_id = ? AND supplier_id IS NOT NULL ORDER BY batch_id DESC LIMIT 1`,
                    [it.product_id]
                );
                supplierId = lastBatch.length > 0 ? lastBatch[0].supplier_id : fallbackSupplierId;
            }

            // Ambil harga pokok jika belum ada
            let cost = parseFloat(it.unit_cost || 0);
            if (cost <= 0) {
                const [p] = await connection.query(`SELECT cost_price FROM products WHERE product_id = ?`, [it.product_id]);
                cost = p.length > 0 ? parseFloat(p[0].cost_price) || 0 : 0;
            }

            if (!groupedBySupplier.has(supplierId)) {
                groupedBySupplier.set(supplierId, []);
            }

            groupedBySupplier.get(supplierId).push({
                product_id: it.product_id,
                ordered_quantity: parseInt(it.quantity, 10) || 1,
                unit_cost: cost
            });
        }

        // 3. Buat satu Draft PO terkonsolidasi untuk setiap supplier
        const createdPos = [];
        for (const [supId, poItems] of groupedBySupplier.entries()) {
            const poPayload = {
                supplier_id: supId,
                facility_id: facility_id || 1,
                items: poItems,
                notes: `Draft PO Otomatis Konsolidasi Replenishment (${poItems.length} produk).`,
                user_id: user_id || 1
            };

            const poResult = await orderService.createPurchaseOrder(connection, poPayload);
            createdPos.push(poResult);
        }

        await connection.commit();

        return {
            count: createdPos.length,
            message: `Berhasil membuat ${createdPos.length} Purchase Order terkonsolidasi untuk restock.`,
            purchase_orders: createdPos
        };
    } catch (error) {
        if (connection) await connection.rollback();
        throw error;
    } finally {
        if (connection) connection.release();
    }
}

// ====================================================================
// 3. BATCH AGING ANALYTICS & NEAR-EXPIRY LOSS VALUATION
// ====================================================================

/**
 * Analisis umur batch, klasifikasi risiko kedaluwarsa, dan potensi kerugian (IDR)
 * @param {Object} filters
 * @param {number} [filters.facility_id]
 * @returns {Promise<Object>}
 */
async function getBatchAgingReport(filters = {}) {
    const facilityId = filters.facility_id ? parseInt(filters.facility_id, 10) : null;

    let query = `
        SELECT 
            b.batch_id,
            b.batch_code,
            b.product_id,
            p.product_name,
            p.category,
            p.unit,
            COALESCE(p.cost_price, 0) AS cost_price,
            b.quantity,
            (b.quantity * COALESCE(p.cost_price, 0)) AS batch_asset_value,
            b.expired_date,
            b.received_date,
            DATEDIFF(b.expired_date, CURDATE()) AS days_until_expiry,
            b.location_id,
            l.location_code,
            l.zone_name,
            l.aisle,
            l.rack,
            l.tier,
            l.bin,
            l.facility_id,
            f.facility_code,
            f.facility_name,
            s.supplier_name
        FROM inventory_batches b
        JOIN products p ON b.product_id = p.product_id
        LEFT JOIN warehouse_locations l ON b.location_id = l.location_id
        LEFT JOIN warehouse_facilities f ON l.facility_id = f.facility_id
        LEFT JOIN suppliers s ON b.supplier_id = s.supplier_id
        WHERE b.quantity > 0
    `;
    const params = [];

    if (facilityId) {
        query += ` AND l.facility_id = ?`;
        params.push(facilityId);
    }

    query += ` ORDER BY b.expired_date ASC, b.quantity DESC;`;

    const [rows] = await db.query(query, params);

    // Kategori & Agregasi
    let totalBatches = rows.length;
    let totalUnits = 0;
    let totalInventoryValue = 0;

    const tiers = {
        EXPIRED: { count: 0, units: 0, value: 0, label: 'Kedaluwarsa (<= 0 Hari)', color: 'rose' },
        CRITICAL: { count: 0, units: 0, value: 0, label: 'Kritis (1 - 30 Hari)', color: 'red' },
        WARNING: { count: 0, units: 0, value: 0, label: 'Waspada (31 - 90 Hari)', color: 'amber' },
        HEALTHY: { count: 0, units: 0, value: 0, label: 'Aman (> 90 Hari)', color: 'emerald' }
    };

    const classifiedBatches = [];

    for (const b of rows) {
        const days = parseInt(b.days_until_expiry, 10);
        const tier = classifyBatchAgingTier(days);
        const qty = parseInt(b.quantity, 10) || 0;
        const val = parseFloat(b.batch_asset_value) || 0;

        totalUnits += qty;
        totalInventoryValue += val;

        tiers[tier].count++;
        tiers[tier].units += qty;
        tiers[tier].value += val;

        classifiedBatches.push({
            batch_id: b.batch_id,
            batch_code: b.batch_code || `BATCH-${b.batch_id}`,
            product_id: b.product_id,
            product_name: b.product_name,
            category: b.category,
            unit: b.unit,
            cost_price: parseFloat(b.cost_price) || 0,
            quantity: qty,
            asset_value: val,
            formatted_value: new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val),
            expired_date: b.expired_date,
            received_date: b.received_date,
            days_until_expiry: days,
            tier,
            facility_id: b.facility_id,
            facility_name: b.facility_name || 'Gudang Pusat',
            location_code: b.location_code || 'A-01-01',
            zone_name: b.zone_name || 'Area Umum',
            supplier_name: b.supplier_name || '-'
        });
    }

    // Hitung persentase untuk setiap tier
    for (const key of Object.keys(tiers)) {
        tiers[key].percentage = totalUnits > 0 
            ? Math.round((tiers[key].units / totalUnits) * 100) 
            : 0;
        tiers[key].formatted_value = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(tiers[key].value);
    }

    // Skor kesegaran inventaris: % stok unit yang berstatus HEALTHY & WARNING
    const freshUnits = tiers.HEALTHY.units + tiers.WARNING.units;
    const freshnessScore = totalUnits > 0 ? Math.round((freshUnits / totalUnits) * 100) : 100;

    // Batches berisiko tinggi: EXPIRED & CRITICAL
    const topRiskBatches = classifiedBatches.filter(b => b.tier === 'EXPIRED' || b.tier === 'CRITICAL');

    return {
        summary: {
            total_batches: totalBatches,
            total_units: totalUnits,
            total_inventory_value: totalInventoryValue,
            formatted_inventory_value: new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(totalInventoryValue),
            freshness_score: freshnessScore,
            total_risk_value: tiers.EXPIRED.value + tiers.CRITICAL.value,
            formatted_risk_value: new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(tiers.EXPIRED.value + tiers.CRITICAL.value)
        },
        tiers,
        top_risk_batches: topRiskBatches,
        all_batches: classifiedBatches
    };
}

module.exports = {
    // Pure calculation functions
    calculateReorderRecommendation,
    predictStockoutRisk,
    classifyBatchAgingTier,

    // Database services
    getReplenishmentAlerts,
    generateReorderPurchaseOrder,
    generateBulkReorderPurchaseOrders,
    getBatchAgingReport
};
