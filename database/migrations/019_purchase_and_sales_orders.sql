-- ====================================================================
-- SUPPLYNC WMS - MIGRATION 019: PURCHASE ORDERS (PO) & SALES ORDERS (SO)
-- Non-destructive migration script for Procurement & Sales Lifecycle
-- ====================================================================

-- 1. Create purchase_orders table
CREATE TABLE IF NOT EXISTS `purchase_orders` (
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

-- 2. Create purchase_order_items table
CREATE TABLE IF NOT EXISTS `purchase_order_items` (
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

-- 3. Create sales_orders table
CREATE TABLE IF NOT EXISTS `sales_orders` (
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

-- 4. Create sales_order_items table
CREATE TABLE IF NOT EXISTS `sales_order_items` (
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

-- 5. Seed initial demo Purchase Order & Sales Order
INSERT IGNORE INTO `purchase_orders` (`po_id`, `po_number`, `supplier_id`, `facility_id`, `status`, `total_amount`, `order_date`, `expected_delivery_date`, `created_by`, `approved_by`, `notes`) VALUES
(1, 'PO-20261101-0001', 1, 1, 'APPROVED', 18000000.00, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 3 DAY), 2, 1, 'Restock Pakan Broiler Starter PT Charoen Feedmill');

INSERT IGNORE INTO `purchase_order_items` (`item_id`, `po_id`, `product_id`, `ordered_quantity`, `received_quantity`, `unit_cost`) VALUES
(1, 1, 'PRD-FEED-01', 40, 0, 450000.00);

INSERT IGNORE INTO `sales_orders` (`so_id`, `so_number`, `facility_id`, `customer_name`, `customer_phone`, `customer_address`, `status`, `total_amount`, `order_date`, `delivery_date`, `created_by`, `notes`) VALUES
(1, 'SO-20261102-0001', 1, 'Peternakan Jaya Abadi', '0812-9988-7766', 'Jl. Raya Bogor Km 30, Cibinong', 'CONFIRMED', 12500000.00, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 DAY), 2, 'Pengiriman sore hari sebelum pukul 17:00');

INSERT IGNORE INTO `sales_order_items` (`item_id`, `so_id`, `product_id`, `requested_quantity`, `unit_price`) VALUES
(1, 1, 'PRD-FEED-01', 25, 500000.00);
