const express = require('express');
const router = express.Router();

const productController = require('../controllers/productController');
const stockController = require('../controllers/stockController');
const supplierController = require('../controllers/supplierController');
const categoryController = require('../controllers/categoryController');
const locationController = require('../controllers/locationController');
const authController = require('../controllers/authController');
const analyticsController = require('../controllers/analyticsController');
const reportController = require('../controllers/reportController');
const systemController = require('../controllers/systemController');
const facilityController = require('../controllers/facilityController');
const transferController = require('../controllers/transferController');
const orderController = require('../controllers/orderController');
const replenishmentController = require('../controllers/replenishmentController');

const validator = require('../middlewares/validator');
const { authenticateToken, optionalAuth, authorizeRole, requireFacilityScope } = require('../middlewares/authMiddleware');

// 1. Routes Autentikasi & Pengguna (RBAC)
router.post('/auth/login', authController.login);
router.get('/auth/me', authenticateToken, authController.getMe);
router.get('/auth/users', authController.getAllUsers);

// 2. Routes Eksekutif Analitik & Valuasi Aset KPI
router.get('/analytics/kpi', analyticsController.getKpiSummary);
router.get('/reports/stock-card', reportController.getStockCardReport);

// 3. Routes Master Produk & SKU
router.get('/products', productController.getAllProducts);
router.post('/products', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), validator.validateProduct, productController.createProduct);
router.post('/products/import-csv', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), productController.importProductsCsv);
router.put('/products/:id', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), productController.updateProduct);
router.delete('/products/:id', authenticateToken, authorizeRole('ADMIN'), productController.deleteProduct);
router.get('/products/:id/batches', productController.getProductBatches);

// 4. Batch Priorities (FEFO / FIFO)
router.get('/batches/fifo', productController.getFifoBatches);
router.get('/batches/fefo', productController.getFifoBatches);

// 5. Routes Mutasi Stok, Alokasi FEFO & Operasional Gudang
router.post('/stock/in', authenticateToken, authorizeRole('ADMIN', 'MANAGER', 'STAFF'), requireFacilityScope(), validator.validateStockIn, stockController.addStockBatch);
router.post('/stock/in/import-csv', authenticateToken, authorizeRole('ADMIN', 'MANAGER', 'STAFF'), stockController.importStockInboundCsv);
router.post('/stock/out', authenticateToken, authorizeRole('ADMIN', 'MANAGER', 'STAFF'), validator.validateStockOut, stockController.reduceStockFifo);
router.post('/stock/disposal', authenticateToken, authorizeRole('ADMIN', 'MANAGER', 'STAFF'), validator.validateStockDisposal, stockController.adjustStockDisposal);
router.post('/stock/opname', authenticateToken, authorizeRole('ADMIN', 'MANAGER', 'STAFF'), validator.validateStockOpname, stockController.recordStockOpname);
router.get('/stock/opname', stockController.getOpnameLogs);

// 6. Routes Audit Trail & Transaksi
router.get('/transactions', stockController.getTransactionLogs);

// 7. Routes Master Pemasok & Kategori
router.get('/suppliers', supplierController.getAllSuppliers);
router.post('/suppliers', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), supplierController.createSupplier);

router.get('/categories', categoryController.getAllCategories);
router.post('/categories', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), categoryController.createCategory);

// 8. Routes Lokasi Rak / Bin Gudang (Warehouse Locations)
router.get('/locations', locationController.getAllLocations);
router.post('/locations', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), locationController.createLocation);

// 9. Routes Diagnostik Sistem, Verifikasi Integritas & Backup Database
router.get('/system/health-check', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), systemController.getHealthAndIntegrity);
router.get('/system/backups', authenticateToken, authorizeRole('ADMIN'), systemController.getBackupsList);
router.post('/system/backup', authenticateToken, authorizeRole('ADMIN'), systemController.createBackup);
router.get('/system/backups/:filename', authenticateToken, authorizeRole('ADMIN'), systemController.downloadBackupFile);

// 10. Routes Fasilitas Gudang / Multi-Facility Management
router.get('/facilities', facilityController.getAllFacilities);
router.post('/facilities', authenticateToken, authorizeRole('ADMIN'), facilityController.createFacility);
router.get('/facilities/:id/locations', facilityController.getFacilityLocations);

// 11. Routes Transfer Stok Antar-Gudang (Inter-Warehouse Transfers)
router.get('/transfers', transferController.getAllTransfers);
router.get('/transfers/:id', transferController.getTransferById);
router.post('/transfers', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), transferController.createTransfer);
router.post('/transfers/:id/receive', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), transferController.receiveTransfer);
router.post('/transfers/:id/cancel', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), transferController.cancelTransfer);

// 12. Routes Purchase Orders (PO) - Pengadaan Barang dari Pemasok
router.get('/orders/purchase', authenticateToken, orderController.getAllPurchaseOrders);
router.get('/orders/purchase/:id', authenticateToken, orderController.getPurchaseOrderById);
router.post('/orders/purchase', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), orderController.createPurchaseOrder);
router.post('/orders/purchase/:id/approve', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), orderController.approvePurchaseOrder);
router.post('/orders/purchase/:id/receive', authenticateToken, authorizeRole('ADMIN', 'MANAGER', 'STAFF'), orderController.receivePurchaseOrder);
router.post('/orders/purchase/:id/cancel', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), orderController.cancelPurchaseOrder);

// 13. Routes Sales Orders (SO) - Pesanan Penjualan Pelanggan
router.get('/orders/sales', authenticateToken, orderController.getAllSalesOrders);
router.get('/orders/sales/:id', authenticateToken, orderController.getSalesOrderById);
router.post('/orders/sales', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), orderController.createSalesOrder);
router.post('/orders/sales/:id/confirm', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), orderController.confirmSalesOrder);
router.post('/orders/sales/:id/dispatch', authenticateToken, authorizeRole('ADMIN', 'MANAGER', 'STAFF'), orderController.dispatchSalesOrder);
router.post('/orders/sales/:id/cancel', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), orderController.cancelSalesOrder);

// 14. Routes Otomatisasi Restock, Reorder PO & Analisis Batch Aging (Phase 19)
router.get('/replenishment/alerts', authenticateToken, replenishmentController.getReplenishmentAlerts);
router.post('/replenishment/reorder/:productId', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), replenishmentController.generateReorderPo);
router.post('/replenishment/reorder-bulk', authenticateToken, authorizeRole('ADMIN', 'MANAGER'), replenishmentController.generateBulkReorderPos);
router.get('/replenishment/batch-aging', authenticateToken, replenishmentController.getBatchAgingReport);

module.exports = router;
