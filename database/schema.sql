-- ====================================================================
-- SUPPLYNC - ENTERPRISE MINI WAREHOUSE MANAGEMENT SYSTEM (WMS)
-- DATABASE SCHEMA DEFINITION & SEED DATA (MySQL 8.0+)
-- ====================================================================

CREATE DATABASE IF NOT EXISTS `supplysync_db` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `supplysync_db`;

-- Set timezone & strict SQL mode
SET time_zone = '+07:00';
SET foreign_key_checks = 0;

-- Drop existing tables to ensure clean initialization if re-run
DROP TABLE IF EXISTS `stock_transaction_items`;
DROP TABLE IF EXISTS `stock_transactions`;
DROP TABLE IF EXISTS `stock_opname`;
DROP TABLE IF EXISTS `inventory_batches`;
DROP TABLE IF EXISTS `products`;
DROP TABLE IF EXISTS `suppliers`;
DROP TABLE IF EXISTS `categories`;
DROP TABLE IF EXISTS `users`;

SET foreign_key_checks = 1;

-- --------------------------------------------------------------------
-- 1. TABEL PENGGUNA & RBAC (users)
-- --------------------------------------------------------------------
CREATE TABLE `users` (
    `user_id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(50) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `full_name` VARCHAR(100) NOT NULL,
    `role` ENUM('ADMIN', 'MANAGER', 'STAFF') NOT NULL DEFAULT 'STAFF',
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_users_role` (`role`),
    INDEX `idx_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 2. TABEL KATEGORI PRODUK (categories)
-- --------------------------------------------------------------------
CREATE TABLE `categories` (
    `category_id` INT AUTO_INCREMENT PRIMARY KEY,
    `category_name` VARCHAR(100) NOT NULL UNIQUE,
    `description` VARCHAR(255) DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 3. TABEL PEMASOK / SUPPLIERS (suppliers)
-- --------------------------------------------------------------------
CREATE TABLE `suppliers` (
    `supplier_id` INT AUTO_INCREMENT PRIMARY KEY,
    `supplier_code` VARCHAR(50) NOT NULL UNIQUE,
    `supplier_name` VARCHAR(150) NOT NULL,
    `contact_person` VARCHAR(100) DEFAULT NULL,
    `phone` VARCHAR(30) DEFAULT NULL,
    `email` VARCHAR(100) DEFAULT NULL,
    `address` TEXT DEFAULT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_supplier_code` (`supplier_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 4. TABEL MASTER PRODUK / SKU (products)
-- --------------------------------------------------------------------
CREATE TABLE `products` (
    `product_id` VARCHAR(50) PRIMARY KEY,
    `product_name` VARCHAR(200) NOT NULL,
    `category` VARCHAR(100) NOT NULL,
    `unit` VARCHAR(50) NOT NULL DEFAULT 'Pcs',
    `min_stock` INT NOT NULL DEFAULT 10,
    `description` TEXT DEFAULT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `chk_min_stock` CHECK (`min_stock` >= 0),
    INDEX `idx_products_category` (`category`),
    INDEX `idx_products_name` (`product_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 5. TABEL BATCH INVENTARIS & EXPIRED TRACKING (inventory_batches)
-- --------------------------------------------------------------------
CREATE TABLE `inventory_batches` (
    `batch_id` INT AUTO_INCREMENT PRIMARY KEY,
    `batch_code` VARCHAR(50) DEFAULT NULL,
    `product_id` VARCHAR(50) NOT NULL,
    `supplier_id` INT DEFAULT NULL,
    `initial_quantity` INT NOT NULL DEFAULT 0,
    `quantity` INT NOT NULL DEFAULT 0,
    `expired_date` DATE NOT NULL,
    `received_date` DATE NOT NULL,
    `notes` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_batches_product` FOREIGN KEY (`product_id`) 
        REFERENCES `products` (`product_id`) 
        ON UPDATE CASCADE 
        ON DELETE RESTRICT,
    CONSTRAINT `fk_batches_supplier` FOREIGN KEY (`supplier_id`) 
        REFERENCES `suppliers` (`supplier_id`) 
        ON UPDATE CASCADE 
        ON DELETE SET NULL,
    CONSTRAINT `chk_batch_quantity` CHECK (`quantity` >= 0),
    -- Index komposit krusial untuk performa FEFO Engine (Urutan Expired Paling Dekat)
    INDEX `idx_batch_fefo` (`product_id`, `quantity`, `expired_date`, `received_date`, `batch_id`),
    INDEX `idx_batch_expiry` (`expired_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 6. TABEL AUDIT LOG TRANSAKSI MUTASI STOK (stock_transactions)
-- --------------------------------------------------------------------
CREATE TABLE `stock_transactions` (
    `transaction_id` INT AUTO_INCREMENT PRIMARY KEY,
    `reference_no` VARCHAR(100) DEFAULT NULL,
    `product_id` VARCHAR(50) NOT NULL,
    `user_id` INT DEFAULT NULL,
    `transaction_type` ENUM('IN', 'OUT', 'DISPOSAL', 'ADJUSTMENT') NOT NULL,
    `quantity` INT NOT NULL,
    `notes` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_trx_product` FOREIGN KEY (`product_id`) 
        REFERENCES `products` (`product_id`) 
        ON UPDATE CASCADE 
        ON DELETE RESTRICT,
    CONSTRAINT `fk_trx_user` FOREIGN KEY (`user_id`) 
        REFERENCES `users` (`user_id`) 
        ON UPDATE CASCADE 
        ON DELETE SET NULL,
    CONSTRAINT `chk_trx_quantity` CHECK (`quantity` > 0),
    INDEX `idx_trx_created_at` (`created_at` DESC),
    INDEX `idx_trx_type` (`transaction_type`),
    INDEX `idx_trx_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 7. TABEL RINCIAN ALOKASI BATCH TRANSAKSI (stock_transaction_items)
-- --------------------------------------------------------------------
CREATE TABLE `stock_transaction_items` (
    `item_id` INT AUTO_INCREMENT PRIMARY KEY,
    `transaction_id` INT NOT NULL,
    `batch_id` INT NOT NULL,
    `quantity` INT NOT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_item_trx` FOREIGN KEY (`transaction_id`) 
        REFERENCES `stock_transactions` (`transaction_id`) 
        ON DELETE CASCADE,
    CONSTRAINT `fk_item_batch` FOREIGN KEY (`batch_id`) 
        REFERENCES `inventory_batches` (`batch_id`) 
        ON DELETE RESTRICT,
    CONSTRAINT `chk_item_quantity` CHECK (`quantity` > 0),
    INDEX `idx_item_trx` (`transaction_id`),
    INDEX `idx_item_batch` (`batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 8. TABEL REKONSILIASI STOK OPNAME (stock_opname)
-- --------------------------------------------------------------------
CREATE TABLE `stock_opname` (
    `opname_id` INT AUTO_INCREMENT PRIMARY KEY,
    `opname_number` VARCHAR(100) NOT NULL UNIQUE,
    `product_id` VARCHAR(50) NOT NULL,
    `system_stock` INT NOT NULL,
    `physical_stock` INT NOT NULL,
    `difference` INT NOT NULL,
    `reason` TEXT NOT NULL,
    `performed_by` INT DEFAULT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'APPROVED',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_opname_product` FOREIGN KEY (`product_id`) 
        REFERENCES `products` (`product_id`) 
        ON UPDATE CASCADE 
        ON DELETE RESTRICT,
    CONSTRAINT `fk_opname_user` FOREIGN KEY (`performed_by`) 
        REFERENCES `users` (`user_id`) 
        ON UPDATE CASCADE 
        ON DELETE SET NULL,
    INDEX `idx_opname_date` (`created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ====================================================================
-- SEED DATA INITIAL (Untuk Pengujian & Portofolio Ready)
-- ====================================================================

-- 1. Seed Users (Default admin, manager, staff)
INSERT INTO `users` (`user_id`, `username`, `password_hash`, `full_name`, `role`) VALUES
(1, 'admin', '$2b$10$3p9h7kE9Q5k9M0m7gPj.1Op4rQ8nJ2e1V6y9K4h3nF5m6p7q8r9s0', 'Choqy Pananda', 'ADMIN'),
(2, 'manager', '$2b$10$3p9h7kE9Q5k9M0m7gPj.1Op4rQ8nJ2e1V6y9K4h3nF5m6p7q8r9s0', 'Siti Rahmawati', 'MANAGER'),
(3, 'staff', '$2b$10$3p9h7kE9Q5k9M0m7gPj.1Op4rQ8nJ2e1V6y9K4h3nF5m6p7q8r9s0', 'Budi Santoso', 'STAFF');

-- 2. Seed Categories
INSERT INTO `categories` (`category_id`, `category_name`, `description`) VALUES
(1, 'Sembako & Pangan', 'Bahan pangan pokok kebutuhan rumah tangga dan industri makanan'),
(2, 'Pakan Ternak (Feed)', 'Pakan formula unggas starter, grower, dan finisher'),
(3, 'Produk Olahan Daging (Cold Chain)', 'Olahan daging beku ayam potong dan fillet higienis'),
(4, 'Bahan Kimia & Pembersih', 'Sanitizer dan desinfektan biosekuriti kandang & gudang');

-- 3. Seed Suppliers
INSERT INTO `suppliers` (`supplier_id`, `supplier_code`, `supplier_name`, `contact_person`, `phone`, `email`, `address`) VALUES
(1, 'SUP-001', 'PT Charoen Feedmill Indonesia', 'Hendro Wijaya', '0812-3456-7890', 'hendro@feedmill.co.id', 'Kawasan Industri Medan (KIM) II'),
(2, 'SUP-002', 'PT Salim Ivomas Pratama', 'Dewi Lestari', '0813-9876-5432', 'dewi@salimivomas.com', 'Jl. Tanjung Morawa Km 12'),
(3, 'SUP-003', 'CV Berkah Unggas Nusantara', 'Rahmat Hidayat', '0852-1122-3344', 'rahmat@unggasnusantara.com', 'Deli Serdang, Sumatera Utara');

-- 4. Seed Products
INSERT INTO `products` (`product_id`, `product_name`, `category`, `unit`, `min_stock`, `description`) VALUES
('PRD-FEED-01', 'Pakan Broiler Starter (511)', 'Pakan Ternak (Feed)', 'Sak 50Kg', 20, 'Pakan ayam pedaging fase starter umur 1-21 hari'),
('PRD-FEED-02', 'Pakan Broiler Finisher (512)', 'Pakan Ternak (Feed)', 'Sak 50Kg', 15, 'Pakan ayam pedaging fase finisher hingga panen'),
('PRD-OIL-01', 'Minyak Goreng Sawit Premium 2L', 'Sembako & Pangan', 'Karton', 25, 'Minyak nabati kemasan pouch 2 liter isi 6 pouch/karton'),
('PRD-MEAT-01', 'Daging Ayam Karkas Frozen 1.0 - 1.2 Kg', 'Produk Olahan Daging (Cold Chain)', 'Kg', 50, 'Ayam beku utuh higienis bersertifikasi halal'),
('PRD-SAN-01', 'Desinfektan Biosekuriti Gudang 5L', 'Bahan Kimia & Pembersih', 'Jerigen', 10, 'Formula desinfektan spektrum luas untuk sanitasi lantai gudang');

-- 5. Seed Batches (Kombinasi batch expired terdekat & stok aman)
INSERT INTO `inventory_batches` (`batch_id`, `batch_code`, `product_id`, `supplier_id`, `initial_quantity`, `quantity`, `expired_date`, `received_date`, `notes`) VALUES
-- PRD-FEED-01: Ada batch yang expired 15 hari lagi (Prioritas FEFO) dan batch 90 hari lagi
(1, 'BTC-FEED01-001', 'PRD-FEED-01', 1, 40, 15, DATE_ADD(CURDATE(), INTERVAL 14 DAY), DATE_SUB(CURDATE(), INTERVAL 60 DAY), 'Batch kedatangan supplier KIM II'),
(2, 'BTC-FEED01-002', 'PRD-FEED-01', 1, 50, 50, DATE_ADD(CURDATE(), INTERVAL 90 DAY), DATE_SUB(CURDATE(), INTERVAL 10 DAY), 'Penerimaan rutin awal bulan'),

-- PRD-FEED-02: Total stok 12 (Di bawah min_stock 15 = Low Stock Warning)
(3, 'BTC-FEED02-001', 'PRD-FEED-02', 1, 30, 12, DATE_ADD(CURDATE(), INTERVAL 45 DAY), DATE_SUB(CURDATE(), INTERVAL 20 DAY), 'Stok menipis butuh restock'),

-- PRD-OIL-01: Stok aman 60 Karton
(4, 'BTC-OIL01-001', 'PRD-OIL-01', 2, 60, 60, DATE_ADD(CURDATE(), INTERVAL 180 DAY), DATE_SUB(CURDATE(), INTERVAL 5 DAY), 'Pasokan pabrik Tanjung Morawa'),

-- PRD-MEAT-01: Cold storage batch expired 30 hari lagi
(5, 'BTC-MEAT01-001', 'PRD-MEAT-01', 3, 100, 75, DATE_ADD(CURDATE(), INTERVAL 30 DAY), DATE_SUB(CURDATE(), INTERVAL 7 DAY), 'Simpan pada cold room freezer -18C'),

-- PRD-SAN-01: 5 jerigen (Low stock, min 10)
(6, 'BTC-SAN01-001', 'PRD-SAN-01', 1, 10, 5, DATE_ADD(CURDATE(), INTERVAL 365 DAY), DATE_SUB(CURDATE(), INTERVAL 30 DAY), 'Sanitasi rutin');

-- 6. Seed Stock Transactions (Initial logs)
INSERT INTO `stock_transactions` (`transaction_id`, `reference_no`, `product_id`, `user_id`, `transaction_type`, `quantity`, `notes`, `created_at`) VALUES
(1, 'TRX-IN-20261101-0001', 'PRD-FEED-01', 1, 'IN', 40, 'Penerimaan batch perdana BTC-FEED01-001', DATE_SUB(NOW(), INTERVAL 5 DAY)),
(2, 'TRX-IN-20261101-0002', 'PRD-FEED-01', 1, 'IN', 50, 'Penerimaan restock batch BTC-FEED01-002', DATE_SUB(NOW(), INTERVAL 3 DAY)),
(3, 'TRX-OUT-20261102-0001', 'PRD-FEED-01', 3, 'OUT', 25, 'Pengeluaran FEFO untuk Peternakan Mitra Farm A', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(4, 'TRX-IN-20261102-0002', 'PRD-OIL-01', 1, 'IN', 60, 'Penerimaan batch minyak goreng 60 karton', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(5, 'TRX-IN-20261102-0003', 'PRD-MEAT-01', 1, 'IN', 100, 'Inbound karkas ayam beku 100 Kg cold chain', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(6, 'TRX-OUT-20261103-0001', 'PRD-MEAT-01', 3, 'OUT', 25, 'Pengiriman ke Horeca Resto Medan', DATE_SUB(NOW(), INTERVAL 6 HOUR));

-- 7. Seed Stock Transaction Items (Breakdown ke batch)
INSERT INTO `stock_transaction_items` (`transaction_id`, `batch_id`, `quantity`) VALUES
(1, 1, 40),
(2, 2, 50),
(3, 1, 25),
(4, 4, 60),
(5, 5, 100),
(6, 5, 25);
