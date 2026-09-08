const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

// Endpoint untuk mengambil semua produk & total stok
router.get('/products', productController.getAllProducts);

// Endpoint untuk mengambil urutan batch FIFO (Expired terdekat)
router.get('/batches/fifo', productController.getFifoBatches);

module.exports = router;