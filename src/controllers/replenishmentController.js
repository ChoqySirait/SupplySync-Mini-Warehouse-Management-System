const replenishmentService = require('../services/replenishmentService');

/**
 * Controller untuk Otomatisasi Restock, PO Reorder & Analisis Batch Aging (Phase 19)
 */

exports.getReplenishmentAlerts = async (req, res) => {
    try {
        let facilityId = req.query.facility_id;

        // Jika user adalah STAFF, batasi query hanya ke fasilitasnya
        if (req.user && req.user.role === 'STAFF') {
            facilityId = req.user.facility_id;
        }

        const result = await replenishmentService.getReplenishmentAlerts({
            facility_id: facilityId
        });

        res.json({
            status: 'Success',
            data: result
        });
    } catch (error) {
        console.error('❌ Error getReplenishmentAlerts:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

exports.generateReorderPo = async (req, res) => {
    try {
        const productId = req.params.productId;
        const { facility_id, supplier_id, quantity } = req.body;
        const userId = req.user ? req.user.user_id : 1;

        // Scoping fasilitas untuk staf
        let targetFacilityId = facility_id;
        if (req.user && req.user.role === 'STAFF') {
            targetFacilityId = req.user.facility_id;
        }

        const result = await replenishmentService.generateReorderPurchaseOrder({
            product_id: productId,
            facility_id: targetFacilityId,
            supplier_id,
            quantity,
            user_id: userId
        });

        res.status(201).json({
            status: 'Success',
            message: `Draft Purchase Order #${result.po_number} berhasil dibuat secara otomatis dari pemicu replenishment.`,
            data: result
        });
    } catch (error) {
        console.error('❌ Error generateReorderPo:', error.message);
        res.status(400).json({ status: 'Error', message: error.message });
    }
};

exports.generateBulkReorderPos = async (req, res) => {
    try {
        const { facility_id, items } = req.body;
        const userId = req.user ? req.user.user_id : 1;

        let targetFacilityId = facility_id;
        if (req.user && req.user.role === 'STAFF') {
            targetFacilityId = req.user.facility_id;
        }

        const result = await replenishmentService.generateBulkReorderPurchaseOrders({
            facility_id: targetFacilityId,
            items,
            user_id: userId
        });

        res.status(201).json({
            status: 'Success',
            message: result.message,
            data: result
        });
    } catch (error) {
        console.error('❌ Error generateBulkReorderPos:', error.message);
        res.status(400).json({ status: 'Error', message: error.message });
    }
};

exports.getBatchAgingReport = async (req, res) => {
    try {
        let facilityId = req.query.facility_id;

        if (req.user && req.user.role === 'STAFF') {
            facilityId = req.user.facility_id;
        }

        const result = await replenishmentService.getBatchAgingReport({
            facility_id: facilityId
        });

        res.json({
            status: 'Success',
            data: result
        });
    } catch (error) {
        console.error('❌ Error getBatchAgingReport:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};
