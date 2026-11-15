const express = require('express');
const router = express.Router();

const productController = require('../controllers/productController');
const stockController = require('../controllers/stockController');
const supplierController = require('../controllers/supplierController');
const categoryController = require('../controllers/categoryController');
const locationController = require('../controllers/locationController');
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const analyticsController = require('../controllers/analyticsController');
const reportController = require('../controllers/reportController');
const systemController = require('../controllers/systemController');
const facilityController = require('../controllers/facilityController');
const transferController = require('../controllers/transferController');
const orderController = require('../controllers/orderController');
const replenishmentController = require('../controllers/replenishmentController');

const validator = require('../middlewares/validator');
const { authenticateToken, optionalAuth, authorizeRole, requireFacilityScope } = require('../middlewares/authMiddleware');

// ====================================================================
// 1. AUTENTIKASI & KEAMANAN SESI
// ====================================================================
router.post('/auth/login', authController.login);
router.get('/auth/me', authenticateToken, authController.getMe);
router.post('/auth/logout', authenticateToken, authController.logout);
router.post('/auth/change-password', authenticateToken, authController.changePassword);
router.post('/auth/setup-admin', authController.setupInitialAdmin);

// Dukungan kompatibilitas daftar user
router.get('/auth/users', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), userController.getAllUsers);

// ====================================================================
// 2. MANAJEMEN PENGGUNA (USER MANAGEMENT & RBAC)
// ====================================================================
router.get('/users', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), userController.getAllUsers);
router.get('/users/:id', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), userController.getUserById);
router.post('/users', authenticateToken, authorizeRole('ADMIN'), userController.createUser);
router.put('/users/:id', authenticateToken, authorizeRole('ADMIN'), userController.updateUser);
router.put('/users/:id/reset-password', authenticateToken, authorizeRole('ADMIN'), userController.resetUserPassword);
router.patch('/users/:id/toggle-status', authenticateToken, authorizeRole('ADMIN'), userController.toggleUserStatus);

// ====================================================================
// 3. ANALITIK, METRIK KPI & PUSAT LAPORAN
// ====================================================================
router.get('/analytics/kpi', authenticateToken, analyticsController.getKpiSummary);
router.get('/reports/stock-card', authenticateToken, reportController.getStockCardReport);
router.get('/reports/valuation', authenticateToken, reportController.getValuationReport);
router.get('/reports/inbound-outbound', authenticateToken, reportController.getInboundOutboundReport);
router.get('/reports/expiry', authenticateToken, reportController.getBatchExpiryReport);

// ====================================================================
// 4. MASTER PRODUK & SKU
// ====================================================================
router.get('/products', authenticateToken, productController.getAllProducts);
router.get('/products/:id/batches', authenticateToken, productController.getProductBatches);
router.post('/products', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), validator.validateProduct, productController.createProduct);
router.post('/products/import-csv', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), productController.importProductsCsv);
router.put('/products/:id', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), productController.updateProduct);
router.delete('/products/:id', authenticateToken, authorizeRole('ADMIN'), productController.deleteProduct);

// Batch Priorities (FEFO / FIFO)
router.get('/batches/fifo', authenticateToken, productController.getFifoBatches);
router.get('/batches/fefo', authenticateToken, productController.getFifoBatches);

// ====================================================================
// 5. OPERASIONAL GUDANG, ALOKASI FEFO & MUTASI STOK
// ====================================================================
router.post('/stock/in', authenticateToken, authorizeRole('ADMIN', 'MANAGER', 'STAFF'), requireFacilityScope(), validator.validateStockIn, stockController.addStockBatch);
router.post('/stock/in/import-csv', authenticateToken, authorizeRole('ADMIN', 'MANAGER', 'STAFF'), requireFacilityScope(), stockController.importStockInboundCsv);
router.post('/stock/out', authenticateToken, authorizeRole('ADMIN', 'MANAGER', 'STAFF'), requireFacilityScope(), validator.validateStockOut, stockController.reduceStockFifo);
router.post('/stock/disposal', authenticateToken, authorizeRole('ADMIN', 'MANAGER', 'STAFF'), requireFacilityScope(), validator.validateStockDisposal, stockController.adjustStockDisposal);
router.post('/stock/opname', authenticateToken, authorizeRole('ADMIN', 'MANAGER', 'STAFF'), requireFacilityScope(), validator.validateStockOpname, stockController.recordStockOpname);
router.get('/stock/opname', authenticateToken, stockController.getOpnameLogs);
router.get('/transactions', authenticateToken, stockController.getTransactionLogs);

// ====================================================================
// 6. MASTER PEMASOK & KATEGORI
// ====================================================================
router.get('/suppliers', authenticateToken, supplierController.getAllSuppliers);
router.get('/suppliers/:id', authenticateToken, supplierController.getSupplierById);
router.post('/suppliers', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), supplierController.createSupplier);
router.put('/suppliers/:id', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), supplierController.updateSupplier);
router.delete('/suppliers/:id', authenticateToken, authorizeRole('ADMIN'), supplierController.deleteSupplier);

router.get('/categories', authenticateToken, categoryController.getAllCategories);
router.get('/categories/:id', authenticateToken, categoryController.getCategoryById);
router.post('/categories', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), categoryController.createCategory);
router.put('/categories/:id', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), categoryController.updateCategory);
router.delete('/categories/:id', authenticateToken, authorizeRole('ADMIN'), categoryController.deleteCategory);

// ====================================================================
// 7. LOKASI RAK / BIN GUDANG & FASILITAS
// ====================================================================
router.get('/locations', authenticateToken, locationController.getAllLocations);
router.get('/locations/:id', authenticateToken, locationController.getLocationById);
router.post('/locations', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), locationController.createLocation);
router.put('/locations/:id', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), locationController.updateLocation);
router.delete('/locations/:id', authenticateToken, authorizeRole('ADMIN'), locationController.deleteLocation);

router.get('/facilities', authenticateToken, facilityController.getAllFacilities);
router.post('/facilities', authenticateToken, authorizeRole('ADMIN'), facilityController.createFacility);
router.get('/facilities/:id/locations', authenticateToken, facilityController.getFacilityLocations);

// ====================================================================
// 8. TRANSFER STOK ANTAR-GUDANG (INTER-WAREHOUSE TRANSFERS)
// ====================================================================
router.get('/transfers', authenticateToken, transferController.getAllTransfers);
router.get('/transfers/:id', authenticateToken, transferController.getTransferById);
router.post('/transfers', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), transferController.createTransfer);
router.post('/transfers/:id/receive', authenticateToken, authorizeRole('ADMIN', 'MANAGER', 'STAFF'), requireFacilityScope(), transferController.receiveTransfer);
router.post('/transfers/:id/cancel', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), transferController.cancelTransfer);

// ====================================================================
// 9. PURCHASE ORDERS (PO) - PENGADAAN
// ====================================================================
router.get('/orders/purchase', authenticateToken, orderController.getAllPurchaseOrders);
router.get('/orders/purchase/:id', authenticateToken, orderController.getPurchaseOrderById);
router.post('/orders/purchase', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), orderController.createPurchaseOrder);
router.post('/orders/purchase/:id/approve', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), orderController.approvePurchaseOrder);
router.post('/orders/purchase/:id/receive', authenticateToken, authorizeRole('ADMIN', 'MANAGER', 'STAFF'), requireFacilityScope(), orderController.receivePurchaseOrder);
router.post('/orders/purchase/:id/cancel', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), orderController.cancelPurchaseOrder);

// ====================================================================
// 10. SALES ORDERS (SO) - PENJUALAN
// ====================================================================
router.get('/orders/sales', authenticateToken, orderController.getAllSalesOrders);
router.get('/orders/sales/:id', authenticateToken, orderController.getSalesOrderById);
router.post('/orders/sales', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), orderController.createSalesOrder);
router.post('/orders/sales/:id/confirm', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), orderController.confirmSalesOrder);
router.post('/orders/sales/:id/dispatch', authenticateToken, authorizeRole('ADMIN', 'MANAGER', 'STAFF'), requireFacilityScope(), orderController.dispatchSalesOrder);
router.post('/orders/sales/:id/cancel', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), orderController.cancelSalesOrder);

// ====================================================================
// 11. OTOMATISASI RESTOCK & ANALISIS BATCH AGING
// ====================================================================
router.get('/replenishment/alerts', authenticateToken, replenishmentController.getReplenishmentAlerts);
router.post('/replenishment/reorder/:productId', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), replenishmentController.generateReorderPo);
router.post('/replenishment/reorder-bulk', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), replenishmentController.generateBulkReorderPos);
router.get('/replenishment/batch-aging', authenticateToken, replenishmentController.getBatchAgingReport);

// ====================================================================
// 12. DIAGNOSTIK SISTEM, INTEGRITAS & CADANGAN DATABASE
// ====================================================================
router.get('/system/health-check', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), systemController.getHealthAndIntegrity);
router.get('/system/backups', authenticateToken, authorizeRole('ADMIN'), systemController.getBackupsList);
router.post('/system/backup', authenticateToken, authorizeRole('ADMIN'), systemController.createBackup);
router.post('/system/restore', authenticateToken, authorizeRole('ADMIN'), systemController.restoreBackup);
router.get('/system/backups/:filename', authenticateToken, authorizeRole('ADMIN'), systemController.downloadBackupFile);

module.exports = router;
