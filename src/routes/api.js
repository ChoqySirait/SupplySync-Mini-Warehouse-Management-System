const express = require('express');
const router = express.Router();

const productController = require('../controllers/productController');
const stockController = require('../controllers/stockController');
const supplierController = require('../controllers/supplierController');
const categoryController = require('../controllers/categoryController');
const locationController = require('../controllers/locationController');
const authController = require('../controllers/authController');

const validator = require('../middlewares/validator');
const { authenticateToken, optionalAuth, authorizeRole } = require('../middlewares/authMiddleware');

// 1. Routes Autentikasi & Pengguna (RBAC)
router.post('/auth/login', authController.login);
router.get('/auth/me', authenticateToken, authController.getMe);
router.get('/auth/users', authController.getAllUsers);

// 2. Routes Produk, SKU & Batch Alokasi
router.get('/products', productController.getAllProducts);
router.post('/products', optionalAuth, validator.validateProduct, productController.createProduct);
router.put('/products/:id', optionalAuth, productController.updateProduct);
router.delete('/products/:id', optionalAuth, authorizeRole('ADMIN'), productController.deleteProduct);
router.get('/products/:id/batches', productController.getProductBatches);

// Batch Priorities (FEFO / FIFO)
router.get('/batches/fifo', productController.getFifoBatches);
router.get('/batches/fefo', productController.getFifoBatches);

// 3. Routes Mutasi Stok, Alokasi FEFO & Operasional Gudang
router.post('/stock/in', optionalAuth, validator.validateStockIn, stockController.addStockBatch);
router.post('/stock/out', optionalAuth, validator.validateStockOut, stockController.reduceStockFifo);
router.post('/stock/disposal', optionalAuth, validator.validateStockDisposal, stockController.adjustStockDisposal);
router.post('/stock/opname', optionalAuth, validator.validateStockOpname, stockController.recordStockOpname);
router.get('/stock/opname', stockController.getOpnameLogs);

// 4. Routes Audit Trail & Transaksi
router.get('/transactions', stockController.getTransactionLogs);

// 5. Routes Master Pemasok & Kategori
router.get('/suppliers', supplierController.getAllSuppliers);
router.post('/suppliers', optionalAuth, supplierController.createSupplier);

router.get('/categories', categoryController.getAllCategories);
router.post('/categories', optionalAuth, categoryController.createCategory);

// 6. Routes Lokasi Rak / Bin Gudang (Warehouse Locations)
router.get('/locations', locationController.getAllLocations);
router.post('/locations', optionalAuth, locationController.createLocation);

module.exports = router;
