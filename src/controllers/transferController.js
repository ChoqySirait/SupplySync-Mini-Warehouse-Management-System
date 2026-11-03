const db = require('../config/database');
const transferService = require('../services/transferService');

/**
 * SupplySync WMS - Inter-Warehouse Transfer & Stock Relocation Controller
 */

/**
 * 1. Ambil Daftar Seluruh Transfer Antar-Gudang
 * GET /api/transfers
 */
exports.getAllTransfers = async (req, res) => {
    try {
        const { status, source_facility_id, destination_facility_id } = req.query;

        let query = `
            SELECT 
                t.transfer_id,
                t.transfer_number,
                t.source_facility_id,
                sf.facility_name AS source_facility_name,
                sf.facility_code AS source_facility_code,
                t.destination_facility_id,
                df.facility_name AS destination_facility_name,
                df.facility_code AS destination_facility_code,
                t.status,
                t.total_sent_quantity,
                t.total_received_quantity,
                (t.total_sent_quantity - t.total_received_quantity) AS total_discrepancy,
                t.sent_at,
                t.received_at,
                t.notes,
                t.cancel_reason,
                u_sent.full_name AS sender_name,
                u_recv.full_name AS receiver_name,
                t.created_at
            FROM stock_transfers t
            JOIN warehouse_facilities sf ON t.source_facility_id = sf.facility_id
            JOIN warehouse_facilities df ON t.destination_facility_id = df.facility_id
            LEFT JOIN users u_sent ON t.sent_by = u_sent.user_id
            LEFT JOIN users u_recv ON t.received_by = u_recv.user_id
            WHERE 1=1
        `;

        const params = [];

        if (status) {
            query += ` AND t.status = ?`;
            params.push(status);
        }

        if (source_facility_id) {
            query += ` AND t.source_facility_id = ?`;
            params.push(source_facility_id);
        }

        if (destination_facility_id) {
            query += ` AND t.destination_facility_id = ?`;
            params.push(destination_facility_id);
        }

        query += ` ORDER BY t.created_at DESC, t.transfer_id DESC`;

        const [transfers] = await db.query(query, params);

        return res.json({
            status: 'Success',
            data: transfers
        });
    } catch (error) {
        console.error('❌ Error getAllTransfers:', error.message);
        return res.status(500).json({
            status: 'Error',
            message: `Gagal memuat data transfer antar-gudang: ${error.message}`
        });
    }
};

/**
 * 2. Ambil Rincian Spesifik Transfer Antar-Gudang
 * GET /api/transfers/:id
 */
exports.getTransferById = async (req, res) => {
    try {
        const { id } = req.params;

        const [transfers] = await db.query(`
            SELECT 
                t.*,
                sf.facility_name AS source_facility_name,
                sf.facility_code AS source_facility_code,
                df.facility_name AS destination_facility_name,
                df.facility_code AS destination_facility_code,
                u_sent.full_name AS sender_name,
                u_recv.full_name AS receiver_name
            FROM stock_transfers t
            JOIN warehouse_facilities sf ON t.source_facility_id = sf.facility_id
            JOIN warehouse_facilities df ON t.destination_facility_id = df.facility_id
            LEFT JOIN users u_sent ON t.sent_by = u_sent.user_id
            LEFT JOIN users u_recv ON t.received_by = u_recv.user_id
            WHERE t.transfer_id = ?
        `, [id]);

        if (transfers.length === 0) {
            return res.status(404).json({
                status: 'Error',
                message: `Transfer dengan ID #${id} tidak ditemukan.`
            });
        }

        const transfer = transfers[0];

        // Ambil rincian item transfer
        const [items] = await db.query(`
            SELECT 
                ti.*,
                p.product_name,
                p.category,
                p.unit,
                sl.location_code AS source_location_code,
                dl.location_code AS destination_location_code
            FROM stock_transfer_items ti
            JOIN products p ON ti.product_id = p.product_id
            LEFT JOIN warehouse_locations sl ON ti.source_location_id = sl.location_id
            LEFT JOIN warehouse_locations dl ON ti.destination_location_id = dl.location_id
            WHERE ti.transfer_id = ?
            ORDER BY ti.item_id ASC
        `, [id]);

        transfer.items = items;

        return res.json({
            status: 'Success',
            data: transfer
        });
    } catch (error) {
        console.error('❌ Error getTransferById:', error.message);
        return res.status(500).json({
            status: 'Error',
            message: `Gagal memuat rincian transfer: ${error.message}`
        });
    }
};

/**
 * 3. Inisiasi Transfer Baru (Transfer Out)
 * POST /api/transfers
 */
exports.createTransfer = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const {
            source_facility_id,
            destination_facility_id,
            items,
            notes
        } = req.body;

        const userId = req.user ? req.user.user_id : null;

        const result = await transferService.initiateStockTransfer(connection, {
            source_facility_id,
            destination_facility_id,
            items,
            notes,
            user_id: userId
        });

        await connection.commit();

        return res.status(201).json({
            status: 'Success',
            message: `Transfer stok #${result.transfer_number} berhasil dimulai dan berstatus IN_TRANSIT.`,
            data: result
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error createTransfer:', error.message);
        return res.status(400).json({
            status: 'Error',
            message: error.message
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * 4. Terima Transfer di Gudang Tujuan (Receive Transfer In)
 * POST /api/transfers/:id/receive
 */
exports.receiveTransfer = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const { id } = req.params;
        const { received_items, notes } = req.body;
        const userId = req.user ? req.user.user_id : null;

        const result = await transferService.receiveStockTransfer(connection, {
            transfer_id: id,
            received_items,
            user_id: userId,
            notes
        });

        await connection.commit();

        return res.json({
            status: 'Success',
            message: `Penerimaan transfer #${result.transfer_number} berhasil diselesaikan dengan status '${result.status}'.`,
            data: result
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error receiveTransfer:', error.message);
        return res.status(400).json({
            status: 'Error',
            message: error.message
        });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * 5. Batalkan Transfer (Cancel Transfer)
 * POST /api/transfers/:id/cancel
 */
exports.cancelTransfer = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const { id } = req.params;
        const { cancel_reason } = req.body;
        const userId = req.user ? req.user.user_id : null;

        const result = await transferService.cancelStockTransfer(connection, {
            transfer_id: id,
            cancel_reason,
            user_id: userId
        });

        await connection.commit();

        return res.json({
            status: 'Success',
            message: `Surat transfer #${result.transfer_number} berhasil dibatalkan dan stok dikembalikan ke gudang asal.`,
            data: result
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error cancelTransfer:', error.message);
        return res.status(400).json({
            status: 'Error',
            message: error.message
        });
    } finally {
        if (connection) connection.release();
    }
};
