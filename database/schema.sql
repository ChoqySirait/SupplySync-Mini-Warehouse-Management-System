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
DROP TABLE IF EXISTS `sales_order_items`;
DROP TABLE IF EXISTS `sales_orders`;
DROP TABLE IF EXISTS `purchase_order_items`;
DROP TABLE IF EXISTS `purchase_orders`;
DROP TABLE IF EXISTS `stock_transfer_items`;
DROP TABLE IF EXISTS `stock_transfers`;
DROP TABLE IF EXISTS `stock_transaction_items`;
DROP TABLE IF EXISTS `stock_transactions`;
DROP TABLE IF EXISTS `stock_opname`;
DROP TABLE IF EXISTS `inventory_batches`;
DROP TABLE IF EXISTS `warehouse_locations`;
DROP TABLE IF EXISTS `warehouse_facilities`;
DROP TABLE IF EXISTS `products`;
DROP TABLE IF EXISTS `suppliers`;
DROP TABLE IF EXISTS `categories`;
DROP TABLE IF EXISTS `users`;

SET foreign_key_checks = 1;

-- --------------------------------------------------------------------
-- 1. TABEL FASILITAS GUDANG / CABANG (warehouse_facilities)
-- --------------------------------------------------------------------
CREATE TABLE `warehouse_facilities` (
    `facility_id` INT AUTO_INCREMENT PRIMARY KEY,
    `facility_code` VARCHAR(50) NOT NULL UNIQUE,
    `facility_name` VARCHAR(150) NOT NULL,
    `facility_type` ENUM('CENTRAL_HUB', 'COLD_STORAGE', 'REGIONAL_DC', 'RETAIL_BUFFER') NOT NULL DEFAULT 'REGIONAL_DC',
    `address` TEXT DEFAULT NULL,
    `city` VARCHAR(100) NOT NULL DEFAULT 'Jakarta',
    `contact_number` VARCHAR(50) DEFAULT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_facility_code` (`facility_code`),
    INDEX `idx_facility_type` (`facility_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 2. TABEL PENGGUNA & RBAC DENGAN FACILITY SCOPING (users)
-- --------------------------------------------------------------------
CREATE TABLE `users` (
    `user_id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(50) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `full_name` VARCHAR(100) NOT NULL,
    `role` ENUM('ADMIN', 'MANAGER', 'STAFF') NOT NULL DEFAULT 'STAFF',
    `facility_id` INT NOT NULL DEFAULT 1,
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_users_facility` FOREIGN KEY (`facility_id`)
        REFERENCES `warehouse_facilities` (`facility_id`)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    INDEX `idx_users_role` (`role`),
    INDEX `idx_users_facility` (`facility_id`),
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
    `lead_time_days` INT NOT NULL DEFAULT 7,
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_supplier_code` (`supplier_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



-- --------------------------------------------------------------------
-- 5. TABEL LOKASI RAK / BIN GUDANG (warehouse_locations)
-- --------------------------------------------------------------------
CREATE TABLE `warehouse_locations` (
    `location_id` INT AUTO_INCREMENT PRIMARY KEY,
    `facility_id` INT NOT NULL DEFAULT 1,
    `location_code` VARCHAR(50) NOT NULL UNIQUE,
    `zone_name` VARCHAR(100) NOT NULL,
    `aisle` VARCHAR(20) NOT NULL,
    `rack` VARCHAR(20) NOT NULL,
    `tier` VARCHAR(20) NOT NULL,
    `bin` VARCHAR(20) NOT NULL,
    `description` VARCHAR(255) DEFAULT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_locations_facility` FOREIGN KEY (`facility_id`) 
        REFERENCES `warehouse_facilities` (`facility_id`) 
        ON UPDATE CASCADE 
        ON DELETE RESTRICT,
    INDEX `idx_location_facility` (`facility_id`),
    INDEX `idx_location_zone` (`zone_name`),
    INDEX `idx_location_code` (`location_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 5. TABEL MASTER PRODUK / SKU (products)
-- --------------------------------------------------------------------
CREATE TABLE `products` (
    `product_id` VARCHAR(50) PRIMARY KEY,
    `product_name` VARCHAR(200) NOT NULL,
    `category` VARCHAR(100) NOT NULL,
    `unit` VARCHAR(50) NOT NULL DEFAULT 'Pcs',
    `min_stock` INT NOT NULL DEFAULT 10,
    `reorder_quantity` INT NOT NULL DEFAULT 0,
    `cost_price` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `description` TEXT DEFAULT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `chk_min_stock` CHECK (`min_stock` >= 0),
    INDEX `idx_products_category` (`category`),
    INDEX `idx_products_name` (`product_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 6. TABEL BATCH INVENTARIS & EXPIRED TRACKING (inventory_batches)
-- --------------------------------------------------------------------
CREATE TABLE `inventory_batches` (
    `batch_id` INT AUTO_INCREMENT PRIMARY KEY,
    `batch_code` VARCHAR(50) DEFAULT NULL,
    `product_id` VARCHAR(50) NOT NULL,
    `supplier_id` INT DEFAULT NULL,
    `location_id` INT DEFAULT NULL,
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
    CONSTRAINT `fk_batches_location` FOREIGN KEY (`location_id`) 
        REFERENCES `warehouse_locations` (`location_id`) 
        ON UPDATE CASCADE 
        ON DELETE SET NULL,
    CONSTRAINT `chk_batch_quantity` CHECK (`quantity` >= 0),
    INDEX `idx_batch_fefo` (`product_id`, `quantity`, `expired_date`, `received_date`, `batch_id`),
    INDEX `idx_batch_expiry` (`expired_date`),
    INDEX `idx_batch_location` (`location_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 8. TABEL AUDIT LOG TRANSAKSI MUTASI STOK (stock_transactions)
-- --------------------------------------------------------------------
CREATE TABLE `stock_transactions` (
    `transaction_id` INT AUTO_INCREMENT PRIMARY KEY,
    `reference_no` VARCHAR(100) DEFAULT NULL,
    `product_id` VARCHAR(50) NOT NULL,
    `user_id` INT DEFAULT NULL,
    `transaction_type` ENUM('IN', 'OUT', 'DISPOSAL', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN') NOT NULL,
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
-- 9. TABEL RINCIAN ALOKASI BATCH TRANSAKSI (stock_transaction_items)
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
-- 10. TABEL PERINTAH TRANSFER STOK ANTAR-GUDANG (stock_transfers)
-- --------------------------------------------------------------------
CREATE TABLE `stock_transfers` (
    `transfer_id` INT AUTO_INCREMENT PRIMARY KEY,
    `transfer_number` VARCHAR(100) NOT NULL UNIQUE,
    `source_facility_id` INT NOT NULL,
    `destination_facility_id` INT NOT NULL,
    `status` ENUM('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'PARTIALLY_RECEIVED', 'CANCELLED') NOT NULL DEFAULT 'IN_TRANSIT',
    `total_sent_quantity` INT NOT NULL DEFAULT 0,
    `total_received_quantity` INT NOT NULL DEFAULT 0,
    `sent_by` INT DEFAULT NULL,
    `received_by` INT DEFAULT NULL,
    `sent_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `received_at` TIMESTAMP NULL DEFAULT NULL,
    `notes` TEXT DEFAULT NULL,
    `cancel_reason` VARCHAR(255) DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_transfer_source` FOREIGN KEY (`source_facility_id`) 
        REFERENCES `warehouse_facilities` (`facility_id`) 
        ON UPDATE CASCADE 
        ON DELETE RESTRICT,
    CONSTRAINT `fk_transfer_dest` FOREIGN KEY (`destination_facility_id`) 
        REFERENCES `warehouse_facilities` (`facility_id`) 
        ON UPDATE CASCADE 
        ON DELETE RESTRICT,
    CONSTRAINT `fk_transfer_sender` FOREIGN KEY (`sent_by`) 
        REFERENCES `users` (`user_id`) 
        ON UPDATE CASCADE 
        ON DELETE SET NULL,
    CONSTRAINT `fk_transfer_receiver` FOREIGN KEY (`received_by`) 
        REFERENCES `users` (`user_id`) 
        ON UPDATE CASCADE 
        ON DELETE SET NULL,
    CONSTRAINT `chk_transfer_facilities` CHECK (`source_facility_id` != `destination_facility_id`),
    INDEX `idx_transfer_status` (`status`),
    INDEX `idx_transfer_source` (`source_facility_id`),
    INDEX `idx_transfer_dest` (`destination_facility_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 11. TABEL RINCIAN BATCH TRANSFER ANTAR-GUDANG (stock_transfer_items)
-- --------------------------------------------------------------------
CREATE TABLE `stock_transfer_items` (
    `item_id` INT AUTO_INCREMENT PRIMARY KEY,
    `transfer_id` INT NOT NULL,
    `product_id` VARCHAR(50) NOT NULL,
    `source_batch_id` INT NOT NULL,
    `destination_batch_id` INT DEFAULT NULL,
    `source_location_id` INT DEFAULT NULL,
    `destination_location_id` INT DEFAULT NULL,
    `batch_code` VARCHAR(50) DEFAULT NULL,
    `expired_date` DATE NOT NULL,
    `sent_quantity` INT NOT NULL,
    `received_quantity` INT NOT NULL DEFAULT 0,
    `discrepancy_quantity` INT NOT NULL DEFAULT 0,
    `discrepancy_reason` VARCHAR(255) DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_trf_item_transfer` FOREIGN KEY (`transfer_id`) 
        REFERENCES `stock_transfers` (`transfer_id`) 
        ON DELETE CASCADE,
    CONSTRAINT `fk_trf_item_product` FOREIGN KEY (`product_id`) 
        REFERENCES `products` (`product_id`) 
        ON UPDATE CASCADE 
        ON DELETE RESTRICT,
    CONSTRAINT `fk_trf_item_batch` FOREIGN KEY (`source_batch_id`) 
        REFERENCES `inventory_batches` (`batch_id`) 
        ON DELETE RESTRICT,
    CONSTRAINT `chk_trf_sent_qty` CHECK (`sent_quantity` > 0),
    CONSTRAINT `chk_trf_recv_qty` CHECK (`received_quantity` >= 0),
    INDEX `idx_trf_item_transfer` (`transfer_id`),
    INDEX `idx_trf_item_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 12. TABEL REKONSILIASI STOK OPNAME (stock_opname)
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


-- --------------------------------------------------------------------
-- 13. TABEL PESANAN PEMBELIAN / PURCHASE ORDERS (purchase_orders)
-- --------------------------------------------------------------------
CREATE TABLE `purchase_orders` (
    `po_id` INT AUTO_INCREMENT PRIMARY KEY,
    `po_number` VARCHAR(100) NOT NULL UNIQUE,
    `supplier_id` INT NOT NULL,
    `facility_id` INT NOT NULL DEFAULT 1,
    `status` ENUM('DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `total_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `order_date` DATE NOT NULL,
    `expected_delivery_date` DATE DEFAULT NULL,
    `created_by` INT DEFAULT NULL,
    `approved_by` INT DEFAULT NULL,
    `notes` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_po_supplier` FOREIGN KEY (`supplier_id`) 
        REFERENCES `suppliers` (`supplier_id`) 
        ON UPDATE CASCADE 
        ON DELETE RESTRICT,
    CONSTRAINT `fk_po_facility` FOREIGN KEY (`facility_id`) 
        REFERENCES `warehouse_facilities` (`facility_id`) 
        ON UPDATE CASCADE 
        ON DELETE RESTRICT,
    CONSTRAINT `fk_po_created_user` FOREIGN KEY (`created_by`) 
        REFERENCES `users` (`user_id`) 
        ON UPDATE CASCADE 
        ON DELETE SET NULL,
    CONSTRAINT `fk_po_approved_user` FOREIGN KEY (`approved_by`) 
        REFERENCES `users` (`user_id`) 
        ON UPDATE CASCADE 
        ON DELETE SET NULL,
    INDEX `idx_po_number` (`po_number`),
    INDEX `idx_po_status` (`status`),
    INDEX `idx_po_order_date` (`order_date` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 14. TABEL ITEM RINCIAN PURCHASE ORDER (purchase_order_items)
-- --------------------------------------------------------------------
CREATE TABLE `purchase_order_items` (
    `item_id` INT AUTO_INCREMENT PRIMARY KEY,
    `po_id` INT NOT NULL,
    `product_id` VARCHAR(50) NOT NULL,
    `ordered_quantity` INT NOT NULL,
    `received_quantity` INT NOT NULL DEFAULT 0,
    `unit_cost` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_poi_po` FOREIGN KEY (`po_id`) 
        REFERENCES `purchase_orders` (`po_id`) 
        ON UPDATE CASCADE 
        ON DELETE CASCADE,
    CONSTRAINT `fk_poi_product` FOREIGN KEY (`product_id`) 
        REFERENCES `products` (`product_id`) 
        ON UPDATE CASCADE 
        ON DELETE RESTRICT,
    INDEX `idx_poi_po_id` (`po_id`),
    INDEX `idx_poi_product_id` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 15. TABEL PESANAN PENJUALAN / SALES ORDERS (sales_orders)
-- --------------------------------------------------------------------
CREATE TABLE `sales_orders` (
    `so_id` INT AUTO_INCREMENT PRIMARY KEY,
    `so_number` VARCHAR(100) NOT NULL UNIQUE,
    `facility_id` INT NOT NULL DEFAULT 1,
    `customer_name` VARCHAR(150) NOT NULL,
    `customer_phone` VARCHAR(50) DEFAULT NULL,
    `customer_address` TEXT DEFAULT NULL,
    `status` ENUM('DRAFT', 'CONFIRMED', 'DISPATCHED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `total_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `order_date` DATE NOT NULL,
    `delivery_date` DATE DEFAULT NULL,
    `created_by` INT DEFAULT NULL,
    `notes` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_so_facility` FOREIGN KEY (`facility_id`) 
        REFERENCES `warehouse_facilities` (`facility_id`) 
        ON UPDATE CASCADE 
        ON DELETE RESTRICT,
    CONSTRAINT `fk_so_created_user` FOREIGN KEY (`created_by`) 
        REFERENCES `users` (`user_id`) 
        ON UPDATE CASCADE 
        ON DELETE SET NULL,
    INDEX `idx_so_number` (`so_number`),
    INDEX `idx_so_status` (`status`),
    INDEX `idx_so_order_date` (`order_date` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 16. TABEL ITEM RINCIAN SALES ORDER (sales_order_items)
-- --------------------------------------------------------------------
CREATE TABLE `sales_order_items` (
    `item_id` INT AUTO_INCREMENT PRIMARY KEY,
    `so_id` INT NOT NULL,
    `product_id` VARCHAR(50) NOT NULL,
    `requested_quantity` INT NOT NULL,
    `unit_price` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_soi_so` FOREIGN KEY (`so_id`) 
        REFERENCES `sales_orders` (`so_id`) 
        ON UPDATE CASCADE 
        ON DELETE CASCADE,
    CONSTRAINT `fk_soi_product` FOREIGN KEY (`product_id`) 
        REFERENCES `products` (`product_id`) 
        ON UPDATE CASCADE 
        ON DELETE RESTRICT,
    INDEX `idx_soi_so_id` (`so_id`),
    INDEX `idx_soi_product_id` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ====================================================================
-- SEED DATA INITIAL
-- ====================================================================

-- 1. Seed Warehouse Facilities
INSERT INTO `warehouse_facilities` (`facility_id`, `facility_code`, `facility_name`, `facility_type`, `address`, `city`, `contact_number`) VALUES
(1, 'WH-JKT-01', 'Gudang Pusat Cakung', 'CENTRAL_HUB', 'Kawasan Industri Pulogadung & Cakung', 'Jakarta Timur', '021-4601234'),
(2, 'WH-SBY-01', 'Cold Storage Rungkut', 'COLD_STORAGE', 'Kawasan Industri SIER Rungkut', 'Surabaya', '031-8431234'),
(3, 'WH-MDN-01', 'Regional DC Belawan', 'REGIONAL_DC', 'Kawasan Industri Medan (KIM) II', 'Medan', '061-6851234');

-- 2. Seed Users (Default admin, manager, staff Cakung, staff Surabaya)
INSERT INTO `users` (`user_id`, `username`, `password_hash`, `full_name`, `role`, `facility_id`) VALUES
(1, 'admin', 'scrypt$a1b2c3d4e5f60718$3f5a2b1c8d9e0f', 'Choqy Pananda', 'ADMIN', 1),
(2, 'manager', 'scrypt$a1b2c3d4e5f60718$3f5a2b1c8d9e0f', 'Siti Rahmawati', 'MANAGER', 1),
(3, 'staff', 'scrypt$a1b2c3d4e5f60718$3f5a2b1c8d9e0f', 'Budi Santoso', 'STAFF', 1),
(4, 'staff_sby', 'scrypt$a1b2c3d4e5f60718$3f5a2b1c8d9e0f', 'Surya Pratama', 'STAFF', 2);

-- 3. Seed Categories
INSERT INTO `categories` (`category_id`, `category_name`, `description`) VALUES
(1, 'Sembako & Pangan', 'Bahan pangan pokok kebutuhan rumah tangga dan industri makanan'),
(2, 'Pakan Ternak (Feed)', 'Pakan formula unggas starter, grower, dan finisher'),
(3, 'Produk Olahan Daging (Cold Chain)', 'Olahan daging beku ayam potong dan fillet higienis'),
(4, 'Bahan Kimia & Pembersih', 'Sanitizer dan desinfektan biosekuriti kandang & gudang');

-- 3. Seed Suppliers
INSERT INTO `suppliers` (`supplier_id`, `supplier_code`, `supplier_name`, `contact_person`, `phone`, `email`, `address`, `lead_time_days`) VALUES
(1, 'SUP-001', 'PT Charoen Feedmill Indonesia', 'Hendro Wijaya', '0812-3456-7890', 'hendro@feedmill.co.id', 'Kawasan Industri Medan (KIM) II', 5),
(2, 'SUP-002', 'PT Salim Ivomas Pratama', 'Dewi Lestari', '0813-9876-5432', 'dewi@salimivomas.com', 'Jl. Tanjung Morawa Km 12', 7),
(3, 'SUP-003', 'CV Berkah Unggas Nusantara', 'Rahmat Hidayat', '0852-1122-3344', 'rahmat@unggasnusantara.com', 'Deli Serdang, Sumatera Utara', 3);



-- 5. Seed Warehouse Locations (Ditautkan ke Fasilitas Gudang)
INSERT INTO `warehouse_locations` (`location_id`, `facility_id`, `location_code`, `zone_name`, `aisle`, `rack`, `tier`, `bin`, `description`) VALUES
(1, 1, 'A-01-01', 'Zona Pakan Kering (Dry Feed)', 'Lorong 1', 'Rak 1', 'Tingkat 1', 'Bin 01', 'Rak lantai dasar untuk pakan broiler starter'),
(2, 1, 'A-01-02', 'Zona Pakan Kering (Dry Feed)', 'Lorong 1', 'Rak 1', 'Tingkat 2', 'Bin 02', 'Rak tingkat kedua untuk pakan broiler finisher'),
(3, 1, 'B-02-01', 'Zona Sembako & Minyak', 'Lorong 2', 'Rak 2', 'Tingkat 1', 'Bin 01', 'Area penyimpanan karton minyak goreng premium'),
(4, 1, 'CR-01-01', 'Cold Storage Freezer -18C', 'Lorong Dingin 1', 'Rak 1', 'Tingkat 1', 'Bin 01', 'Ruang pendingin beku karkas ayam potong higienis'),
(5, 1, 'C-01-01', 'Zona Bahan Kimia & Biosekuriti', 'Lorong 3', 'Rak 1', 'Tingkat 1', 'Bin 01', 'Penyimpanan desinfektan dan sanitizer lantai'),
(6, 2, 'SBY-CS-01', 'Zona Cold Storage Surabaya', 'Lorong Beku 1', 'Rak A', 'Tingkat 1', 'Bin 01', 'Cold room penyimpanan karkas ayam Surabaya'),
(7, 2, 'SBY-DRY-01', 'Zona Dry Buffer Surabaya', 'Lorong Kering 1', 'Rak 1', 'Tingkat 1', 'Bin 01', 'Area buffer pakan ternak regional Jawa Timur'),
(8, 3, 'MDN-KIM-01', 'Zona Pakan Ternak KIM II', 'Lorong 1', 'Rak 1', 'Tingkat 1', 'Bin 01', 'Gudang distribusi Medan pakan unggas komersil');

-- 5. Seed Products (Lengkap dengan Harga Pokok / Cost Price untuk Valuasi Aset)
INSERT INTO `products` (`product_id`, `product_name`, `category`, `unit`, `min_stock`, `cost_price`, `description`) VALUES
('PRD-FEED-01', 'Pakan Broiler Starter (511)', 'Pakan Ternak (Feed)', 'Sak 50Kg', 20, 450000.00, 'Pakan ayam pedaging fase starter umur 1-21 hari'),
('PRD-FEED-02', 'Pakan Broiler Finisher (512)', 'Pakan Ternak (Feed)', 'Sak 50Kg', 15, 475000.00, 'Pakan ayam pedaging fase finisher hingga panen'),
('PRD-OIL-01', 'Minyak Goreng Sawit Premium 2L', 'Sembako & Pangan', 'Karton', 25, 95000.00, 'Minyak nabati kemasan pouch 2 liter isi 6 pouch/karton'),
('PRD-MEAT-01', 'Daging Ayam Karkas Frozen 1.0 - 1.2 Kg', 'Produk Olahan Daging (Cold Chain)', 'Kg', 50, 38000.00, 'Ayam beku utuh higienis bersertifikasi halal'),
('PRD-SAN-01', 'Desinfektan Biosekuriti Gudang 5L', 'Bahan Kimia & Pembersih', 'Jerigen', 10, 125000.00, 'Formula desinfektan spektrum luas untuk sanitasi lantai gudang');

-- 6. Seed Batches (Ditautkan ke Lokasi Gudang)
INSERT INTO `inventory_batches` (`batch_id`, `batch_code`, `product_id`, `supplier_id`, `location_id`, `initial_quantity`, `quantity`, `expired_date`, `received_date`, `notes`) VALUES
(1, 'BTC-FEED01-001', 'PRD-FEED-01', 1, 1, 40, 15, DATE_ADD(CURDATE(), INTERVAL 14 DAY), DATE_SUB(CURDATE(), INTERVAL 60 DAY), 'Batch kedatangan supplier KIM II'),
(2, 'BTC-FEED01-002', 'PRD-FEED-01', 1, 1, 50, 50, DATE_ADD(CURDATE(), INTERVAL 90 DAY), DATE_SUB(CURDATE(), INTERVAL 10 DAY), 'Penerimaan rutin awal bulan'),
(3, 'BTC-FEED02-001', 'PRD-FEED-02', 1, 2, 30, 12, DATE_ADD(CURDATE(), INTERVAL 45 DAY), DATE_SUB(CURDATE(), INTERVAL 20 DAY), 'Stok menipis butuh restock'),
(4, 'BTC-OIL01-001', 'PRD-OIL-01', 2, 3, 60, 60, DATE_ADD(CURDATE(), INTERVAL 180 DAY), DATE_SUB(CURDATE(), INTERVAL 5 DAY), 'Pasokan pabrik Tanjung Morawa'),
(5, 'BTC-MEAT01-001', 'PRD-MEAT-01', 3, 4, 100, 75, DATE_ADD(CURDATE(), INTERVAL 30 DAY), DATE_SUB(CURDATE(), INTERVAL 7 DAY), 'Simpan pada cold room freezer -18C'),
(6, 'BTC-SAN01-001', 'PRD-SAN-01', 1, 5, 10, 5, DATE_ADD(CURDATE(), INTERVAL 365 DAY), DATE_SUB(CURDATE(), INTERVAL 30 DAY), 'Sanitasi rutin');

-- 7. Seed Stock Transactions
INSERT INTO `stock_transactions` (`transaction_id`, `reference_no`, `product_id`, `user_id`, `transaction_type`, `quantity`, `notes`, `created_at`) VALUES
(1, 'TRX-IN-20261101-0001', 'PRD-FEED-01', 1, 'IN', 40, 'Penerimaan batch perdana BTC-FEED01-001', DATE_SUB(NOW(), INTERVAL 5 DAY)),
(2, 'TRX-IN-20261101-0002', 'PRD-FEED-01', 1, 'IN', 50, 'Penerimaan restock batch BTC-FEED01-002', DATE_SUB(NOW(), INTERVAL 3 DAY)),
(3, 'TRX-OUT-20261102-0001', 'PRD-FEED-01', 3, 'OUT', 25, 'Pengeluaran FEFO untuk Peternakan Mitra Farm A', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(4, 'TRX-IN-20261102-0002', 'PRD-OIL-01', 1, 'IN', 60, 'Penerimaan batch minyak goreng 60 karton', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(5, 'TRX-IN-20261102-0003', 'PRD-MEAT-01', 1, 'IN', 100, 'Inbound karkas ayam beku 100 Kg cold chain', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(6, 'TRX-OUT-20261103-0001', 'PRD-MEAT-01', 3, 'OUT', 25, 'Pengiriman ke Horeca Resto Medan', DATE_SUB(NOW(), INTERVAL 6 HOUR));

-- 8. Seed Stock Transaction Items
INSERT INTO `stock_transaction_items` (`transaction_id`, `batch_id`, `quantity`) VALUES
(1, 1, 40),
(2, 2, 50),
(3, 1, 25),
(4, 4, 60),
(5, 5, 100),
(6, 5, 25);

-- 9. Seed Purchase Orders & Items
INSERT INTO `purchase_orders` (`po_id`, `po_number`, `supplier_id`, `facility_id`, `status`, `total_amount`, `order_date`, `expected_delivery_date`, `created_by`, `approved_by`, `notes`) VALUES
(1, 'PO-20261101-0001', 1, 1, 'APPROVED', 18000000.00, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 3 DAY), 2, 1, 'Restock Pakan Broiler Starter PT Charoen Feedmill');

INSERT INTO `purchase_order_items` (`item_id`, `po_id`, `product_id`, `ordered_quantity`, `received_quantity`, `unit_cost`) VALUES
(1, 1, 'PRD-FEED-01', 40, 0, 450000.00);

-- 10. Seed Sales Orders & Items
INSERT INTO `sales_orders` (`so_id`, `so_number`, `facility_id`, `customer_name`, `customer_phone`, `customer_address`, `status`, `total_amount`, `order_date`, `delivery_date`, `created_by`, `notes`) VALUES
(1, 'SO-20261102-0001', 1, 'Peternakan Jaya Abadi', '0812-9988-7766', 'Jl. Raya Bogor Km 30, Cibinong', 'CONFIRMED', 12500000.00, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 DAY), 2, 'Pengiriman sore hari sebelum pukul 17:00');

INSERT INTO `sales_order_items` (`item_id`, `so_id`, `product_id`, `requested_quantity`, `unit_price`) VALUES
(1, 1, 'PRD-FEED-01', 25, 500000.00);

