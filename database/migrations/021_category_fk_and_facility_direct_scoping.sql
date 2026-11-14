-- ====================================================================
-- SUPPLYNC WMS - MIGRATION 021: CATEGORY FK & FACILITY DIRECT SCOPING
-- Safe, non-destructive migration script for category normalization,
-- direct batch facility scoping, and password hash security.
-- ====================================================================

-- 1. Tambahkan category_id ke tabel products jika belum ada
SET @col_exist_cat := (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'products' 
      AND COLUMN_NAME = 'category_id'
);

SET @sql_add_cat := IF(@col_exist_cat = 0,
    'ALTER TABLE `products` ADD COLUMN `category_id` INT NULL AFTER `category`',
    'SELECT "Column category_id already exists in products"'
);
PREPARE stmt_add_cat FROM @sql_add_cat;
EXECUTE stmt_add_cat;
DEALLOCATE PREPARE stmt_add_cat;

-- Sinkronisasi category_id dari master categories berdasarkan category_name
UPDATE `products` p
JOIN `categories` c ON TRIM(p.category) = TRIM(c.category_name)
SET p.category_id = c.category_id
WHERE p.category_id IS NULL;

-- Tambahkan Foreign Key pada products.category_id jika belum ada
SET @fk_exist_cat := (
    SELECT COUNT(*) 
    FROM information_schema.TABLE_CONSTRAINTS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'products' 
      AND CONSTRAINT_NAME = 'fk_products_category'
);

SET @sql_fk_cat := IF(@fk_exist_cat = 0,
    'ALTER TABLE `products` ADD CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`category_id`) ON UPDATE CASCADE ON DELETE RESTRICT, ADD INDEX `idx_products_category_id` (`category_id`)',
    'SELECT "Foreign key fk_products_category already exists"'
);
PREPARE stmt_fk_cat FROM @sql_fk_cat;
EXECUTE stmt_fk_cat;
DEALLOCATE PREPARE stmt_fk_cat;

-- 2. Tambahkan facility_id langsung ke inventory_batches jika belum ada
SET @col_exist_batch_fac := (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'inventory_batches' 
      AND COLUMN_NAME = 'facility_id'
);

SET @sql_batch_fac := IF(@col_exist_batch_fac = 0,
    'ALTER TABLE `inventory_batches` ADD COLUMN `facility_id` INT NOT NULL DEFAULT 1 AFTER `product_id`, ADD CONSTRAINT `fk_batches_facility` FOREIGN KEY (`facility_id`) REFERENCES `warehouse_facilities` (`facility_id`) ON UPDATE CASCADE ON DELETE RESTRICT, ADD INDEX `idx_batch_facility_fefo` (`facility_id`, `product_id`, `quantity`, `expired_date`, `batch_id`)',
    'SELECT "Column facility_id already exists in inventory_batches"'
);
PREPARE stmt_batch_fac FROM @sql_batch_fac;
EXECUTE stmt_batch_fac;
DEALLOCATE PREPARE stmt_batch_fac;

-- Sinkronisasi facility_id batch dari lokasi jika ada
UPDATE `inventory_batches` b
JOIN `warehouse_locations` l ON b.location_id = l.location_id
SET b.facility_id = l.facility_id
WHERE b.location_id IS NOT NULL;

-- 3. Tambahkan facility_id ke stock_transactions jika belum ada
SET @col_exist_trx_fac := (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'stock_transactions' 
      AND COLUMN_NAME = 'facility_id'
);

SET @sql_trx_fac := IF(@col_exist_trx_fac = 0,
    'ALTER TABLE `stock_transactions` ADD COLUMN `facility_id` INT NOT NULL DEFAULT 1 AFTER `product_id`, ADD CONSTRAINT `fk_trx_facility` FOREIGN KEY (`facility_id`) REFERENCES `warehouse_facilities` (`facility_id`) ON UPDATE CASCADE ON DELETE RESTRICT, ADD INDEX `idx_trx_facility` (`facility_id`)',
    'SELECT "Column facility_id already exists in stock_transactions"'
);
PREPARE stmt_trx_fac FROM @sql_trx_fac;
EXECUTE stmt_trx_fac;
DEALLOCATE PREPARE stmt_trx_fac;

-- 4. Tambahkan facility_id ke stock_opname jika belum ada
SET @col_exist_opname_fac := (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'stock_opname' 
      AND COLUMN_NAME = 'facility_id'
);

SET @sql_opname_fac := IF(@col_exist_opname_fac = 0,
    'ALTER TABLE `stock_opname` ADD COLUMN `facility_id` INT NOT NULL DEFAULT 1 AFTER `product_id`, ADD CONSTRAINT `fk_opname_facility` FOREIGN KEY (`facility_id`) REFERENCES `warehouse_facilities` (`facility_id`) ON UPDATE CASCADE ON DELETE RESTRICT, ADD INDEX `idx_opname_facility` (`facility_id`)',
    'SELECT "Column facility_id already exists in stock_opname"'
);
PREPARE stmt_opname_fac FROM @sql_opname_fac;
EXECUTE stmt_opname_fac;
DEALLOCATE PREPARE stmt_opname_fac;

-- 5. Perbarui Password Hash Akun Bawaan Seeder dengan scrypt 64-byte yang sah
-- admin123
UPDATE `users` 
SET `password_hash` = 'scrypt$07fa85a8beab6a4f6ba6101480616552$3558bb2504d724f27e8e3e0e325d4145b6b1ca03236a60ce44b5e7968c993904b0d04edd87be121e82788a2d7709b3c7bb195c2031014cc4f67f4f5f7a0c0019'
WHERE `username` = 'admin';

-- manager123
UPDATE `users` 
SET `password_hash` = 'scrypt$bce031ab5dfe2cb75f8ee74f289a97e5$03c4dbee1978b7f668d6a8f5cb6a0eb19ec282b84d3d55ea7678a1b01dba74e13c5d65475ee0ad991a5da1e12938c6c11b9fbafbc12ed3a60af369231427403d'
WHERE `username` = 'manager';

-- staff123
UPDATE `users` 
SET `password_hash` = 'scrypt$395ca05b569dc6f35646f10a47fb63b6$80c674060c0dd5fbf8d271c6cd089e2baea6e4cf7ed453e7671df89404677ed3a57ccd713e6482d24a163e98f1fd121f94aabdb7c31e7b9fdf0ef2ad779f097f'
WHERE `username` IN ('staff', 'staff_sby');
