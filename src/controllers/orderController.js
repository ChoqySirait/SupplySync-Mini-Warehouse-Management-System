const db = require('../config/database');
const orderService = require('../services/orderService');

// ====================================================================
// 1. PURCHASE ORDER (PO) CONTROLLER
// ====================================================================

exports.getAllPurchaseOrders = async (req, res) => {
    try {
        const { status, supplier_id, facility_id } = req.query;
        const orders = await orderService.listPurchaseOrders({ status, supplier_id, facility_id });
        res.json({
            status: 'Success',
            count: orders.length,
            data: orders
        });
    } catch (error) {
        console.error('❌ Error getAllPurchaseOrders:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

exports.getPurchaseOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await orderService.getPurchaseOrderById(id);
        res.json({
            status: 'Success',
            data: order
        });
    } catch (error) {
        console.error('❌ Error getPurchaseOrderById:', error.message);
        res.status(404).json({ status: 'Error', message: error.message });
    }
};

exports.createPurchaseOrder = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const payload = req.body;
        payload.user_id = req.user ? req.user.user_id : 1;

        const result = await orderService.createPurchaseOrder(connection, payload);
        await connection.commit();

        res.status(201).json({
            status: 'Success',
            message: `Purchase Order #${result.po_number} berhasil dibuat (Status: DRAFT).`,
            data: result
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error createPurchaseOrder:', error.message);
        res.status(400).json({ status: 'Error', message: error.message });
    } finally {
        if (connection) connection.release();
    }
};

exports.approvePurchaseOrder = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const { id } = req.params;
        const result = await orderService.approvePurchaseOrder(connection, id, req.user);
        await connection.commit();

        res.json({
            status: 'Success',
            message: `Purchase Order #${result.po_number} berhasil disetujui.`,
            data: result
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error approvePurchaseOrder:', error.message);
        res.status(400).json({ status: 'Error', message: error.message });
    } finally {
        if (connection) connection.release();
    }
};

exports.receivePurchaseOrder = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const { id } = req.params;
        const { items, notes } = req.body;
        const userId = req.user ? req.user.user_id : 1;

        const result = await orderService.receivePurchaseOrder(connection, id, { items, notes, user_id: userId });
        await connection.commit();

        res.json({
            status: 'Success',
            message: `Penerimaan barang untuk PO #${result.po_number} berhasil diproses (Status: ${result.status}).`,
            data: result
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error receivePurchaseOrder:', error.message);
        res.status(400).json({ status: 'Error', message: error.message });
    } finally {
        if (connection) connection.release();
    }
};

exports.cancelPurchaseOrder = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const { id } = req.params;
        const { cancel_reason } = req.body;

        const result = await orderService.cancelPurchaseOrder(connection, id, { reason: cancel_reason, user: req.user });
        await connection.commit();

        res.json({
            status: 'Success',
            message: `Purchase Order #${result.po_number} berhasil dibatalkan.`,
            data: result
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error cancelPurchaseOrder:', error.message);
        res.status(400).json({ status: 'Error', message: error.message });
    } finally {
        if (connection) connection.release();
    }
};

// ====================================================================
// 2. SALES ORDER (SO) CONTROLLER
// ====================================================================

exports.getAllSalesOrders = async (req, res) => {
    try {
        const { status, facility_id } = req.query;
        const orders = await orderService.listSalesOrders({ status, facility_id });
        res.json({
            status: 'Success',
            count: orders.length,
            data: orders
        });
    } catch (error) {
        console.error('❌ Error getAllSalesOrders:', error.message);
        res.status(500).json({ status: 'Error', message: error.message });
    }
};

exports.getSalesOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await orderService.getSalesOrderById(id);
        res.json({
            status: 'Success',
            data: order
        });
    } catch (error) {
        console.error('❌ Error getSalesOrderById:', error.message);
        res.status(404).json({ status: 'Error', message: error.message });
    }
};

exports.createSalesOrder = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const payload = req.body;
        payload.user_id = req.user ? req.user.user_id : 1;

        const result = await orderService.createSalesOrder(connection, payload);
        await connection.commit();

        res.status(201).json({
            status: 'Success',
            message: `Sales Order #${result.so_number} berhasil dibuat (Status: DRAFT).`,
            data: result
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error createSalesOrder:', error.message);
        res.status(400).json({ status: 'Error', message: error.message });
    } finally {
        if (connection) connection.release();
    }
};

exports.confirmSalesOrder = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const { id } = req.params;
        const result = await orderService.confirmSalesOrder(connection, id, req.user);
        await connection.commit();

        res.json({
            status: 'Success',
            message: `Sales Order #${result.so_number} telah dikonfirmasi (Status: CONFIRMED).`,
            data: result
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error confirmSalesOrder:', error.message);
        res.status(400).json({ status: 'Error', message: error.message });
    } finally {
        if (connection) connection.release();
    }
};

exports.dispatchSalesOrder = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const { id } = req.params;
        const { notes } = req.body;
        const userId = req.user ? req.user.user_id : 1;

        const result = await orderService.dispatchSalesOrder(connection, id, { notes, user_id: userId });
        await connection.commit();

        res.json({
            status: 'Success',
            message: `Sales Order #${result.so_number} berhasil dikirim (Status: DISPATCHED).`,
            data: result
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error dispatchSalesOrder:', error.message);
        res.status(400).json({ status: 'Error', message: error.message });
    } finally {
        if (connection) connection.release();
    }
};

exports.cancelSalesOrder = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const { id } = req.params;
        const { cancel_reason } = req.body;

        const result = await orderService.cancelSalesOrder(connection, id, { reason: cancel_reason, user: req.user });
        await connection.commit();

        res.json({
            status: 'Success',
            message: `Sales Order #${result.so_number} berhasil dibatalkan.`,
            data: result
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error cancelSalesOrder:', error.message);
        res.status(400).json({ status: 'Error', message: error.message });
    } finally {
        if (connection) connection.release();
    }
};
