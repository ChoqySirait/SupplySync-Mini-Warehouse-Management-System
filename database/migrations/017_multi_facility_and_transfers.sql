-- ====================================================================
-- SUPPLYNC WMS - MIGRATION 017: MULTI-FACILITY & INTER-WAREHOUSE TRANSFERS
-- Non-destructive migration script for existing databases
-- ====================================================================

-- 1. Create warehouse_facilities table
CREATE TABLE IF NOT EXISTS `warehouse_facilities` (
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

-- 2. Seed default facilities if not present
INSERT IGNORE INTO `warehouse_facilities` (`facility_id`, `facility_code`, `facility_name`, `facility_type`, `address`, `city`, `contact_number`) VALUES
(1, 'WH-JKT-01', 'Gudang Pusat Cakung', 'CENTRAL_HUB', 'Kawasan Industri Pulogadung & Cakung', 'Jakarta Timur', '021-4601234'),
(2, 'WH-SBY-01', 'Cold Storage Rungkut', 'COLD_STORAGE', 'Kawasan Industri SIER Rungkut', 'Surabaya', '031-8431234'),
(3, 'WH-MDN-01', 'Regional DC Belawan', 'REGIONAL_DC', 'Kawasan Industri Medan (KIM) II', 'Medan', '061-6851234');

-- 3. Safely add facility_id to warehouse_locations if not exists
SET @exist_col := (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'warehouse_locations' 
      AND COLUMN_NAME = 'facility_id'
);

SET @sql := IF(@exist_col = 0, 
    'ALTER TABLE `warehouse_locations` ADD COLUMN `facility_id` INT NOT NULL DEFAULT 1 AFTER `location_id`, ADD CONSTRAINT `fk_locations_facility` FOREIGN KEY (`facility_id`) REFERENCES `warehouse_facilities` (`facility_id`) ON UPDATE CASCADE ON DELETE RESTRICT, ADD INDEX `idx_locations_facility` (`facility_id`)',
    'SELECT "Column facility_id already exists in warehouse_locations"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. Update transaction_type ENUM in stock_transactions
ALTER TABLE `stock_transactions` 
MODIFY COLUMN `transaction_type` ENUM('IN', 'OUT', 'DISPOSAL', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN') NOT NULL;

-- 5. Create stock_transfers table
CREATE TABLE IF NOT EXISTS `stock_transfers` (
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

-- 6. Create stock_transfer_items table
CREATE TABLE IF NOT EXISTS `stock_transfer_items` (
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
