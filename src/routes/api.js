const express = require('express');
const router = express.Router();

const productController = require('../controllers/productController');
const stockController = require('../controllers/stockController');
const supplierController = require('../controllers/supplierController');
const categoryController = require('../controllers/categoryController');
const validator = require('../middlewares/validator');

// 1. Routes Produk, SKU & Batch Alokasi
router.get('/products', productController.getAllProducts);
router.post('/products', validator.validateProduct, productController.createProduct);
router.put('/products/:id', productController.updateProduct);
router.delete('/products/:id', productController.deleteProduct);
router.get('/products/:id/batches', productController.getProductBatches);

// Batch Priorities (FEFO / FIFO)
router.get('/batches/fifo', productController.getFifoBatches);
router.get('/batches/fefo', productController.getFifoBatches);

// 2. Routes Mutasi Stok & Operasional Gudang
router.post('/stock/in', validator.validateStockIn, stockController.addStockBatch);
router.post('/stock/out', validator.validateStockOut, stockController.reduceStockFifo);
router.post('/stock/disposal', validator.validateStockDisposal, stockController.adjustStockDisposal);
router.post('/stock/opname', validator.validateStockOpname, stockController.recordStockOpname);
router.get('/stock/opname', stockController.getOpnameLogs);

// 3. Routes Audit Trail & Transaksi
router.get('/transactions', stockController.getTransactionLogs);

// 4. Routes Master Suppliers & Kategori
router.get('/suppliers', supplierController.getAllSuppliers);
router.post('/suppliers', supplierController.createSupplier);

router.get('/categories', categoryController.getAllCategories);
router.post('/categories', categoryController.createCategory);

module.exports = router;
