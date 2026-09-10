const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const stockController = require('../controllers/stockController');

// Routes Produk & Batch
router.get('/products', productController.getAllProducts);
router.post('/products', productController.createProduct);
router.get('/batches/fifo', productController.getFifoBatches);

// Routes Transaksi Stok, Disposal & Audit Log
router.post('/stock/in', stockController.addStockBatch);
router.post('/stock/out', stockController.reduceStockFifo);
router.post('/stock/disposal', stockController.adjustStockDisposal);
router.get('/transactions', stockController.getTransactionLogs);

module.exports = router;