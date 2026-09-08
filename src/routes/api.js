const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const stockController = require('../controllers/stockController');

// Routes Produk & Batch
router.get('/products', productController.getAllProducts);
router.get('/batches/fifo', productController.getFifoBatches);

// Routes Transaksi Stok & Audit Log
router.post('/stock/out', stockController.reduceStockFifo);
router.get('/transactions', stockController.getTransactionLogs);

module.exports = router;