-- ====================================================================
-- SUPPLYNC WMS - MIGRATION 020: INTELLIGENT REPLENISHMENT & BATCH AGING
-- Non-destructive migration script for Reorder Triggers & Expiry Analytics
-- ====================================================================

USE `supplysync_db`;

-- 1. Tambahkan lead_time_days pada tabel suppliers jika belum ada
SET @col_lead_time = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'suppliers' 
      AND COLUMN_NAME = 'lead_time_days'
);

SET @stmt_lead = IF(@col_lead_time = 0, 
    'ALTER TABLE `suppliers` ADD COLUMN `lead_time_days` INT NOT NULL DEFAULT 7 AFTER `address`', 
    'SELECT 1'
);
PREPARE exec_stmt_lead FROM @stmt_lead;
EXECUTE exec_stmt_lead;
DEALLOCATE PREPARE exec_stmt_lead;

-- 2. Tambahkan reorder_quantity pada tabel products jika belum ada
SET @col_reorder_qty = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'products' 
      AND COLUMN_NAME = 'reorder_quantity'
);

SET @stmt_reorder = IF(@col_reorder_qty = 0, 
    'ALTER TABLE `products` ADD COLUMN `reorder_quantity` INT NOT NULL DEFAULT 0 AFTER `min_stock`', 
    'SELECT 1'
);
PREPARE exec_stmt_reorder FROM @stmt_reorder;
EXECUTE exec_stmt_reorder;
DEALLOCATE PREPARE exec_stmt_reorder;

-- 3. Update data bawaan lead time pada supplier default
UPDATE `suppliers` SET `lead_time_days` = 5 WHERE `supplier_code` = 'SUP-001';
UPDATE `suppliers` SET `lead_time_days` = 7 WHERE `supplier_code` = 'SUP-002';
UPDATE `suppliers` SET `lead_time_days` = 3 WHERE `supplier_code` = 'SUP-003';

-- 4. Indeks performa untuk kueri cepat batch aging & FEFO
ALTER TABLE `inventory_batches` 
ADD INDEX IF NOT EXISTS `idx_batch_aging` (`expired_date`, `quantity`);
