-- ====================================================================
-- SUPPLYNC WMS - MIGRATION 018: USER FACILITY SCOPING & RBAC HARDENING
-- Non-destructive migration script for multi-facility user scoping
-- ====================================================================

-- 1. Safely add facility_id to users table if not exists
SET @exist_user_facility := (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'facility_id'
);

SET @sql_user_fac := IF(@exist_user_facility = 0, 
    'ALTER TABLE `users` ADD COLUMN `facility_id` INT NOT NULL DEFAULT 1 AFTER `role`, ADD CONSTRAINT `fk_users_facility` FOREIGN KEY (`facility_id`) REFERENCES `warehouse_facilities` (`facility_id`) ON UPDATE CASCADE ON DELETE RESTRICT, ADD INDEX `idx_users_facility` (`facility_id`)',
    'SELECT "Column facility_id already exists in users"'
);
PREPARE stmt_user_fac FROM @sql_user_fac;
EXECUTE stmt_user_fac;
DEALLOCATE PREPARE stmt_user_fac;

-- 2. Update default users and insert secondary facility staff
UPDATE `users` SET `facility_id` = 1 WHERE `username` = 'admin';
UPDATE `users` SET `facility_id` = 1 WHERE `username` = 'manager';
UPDATE `users` SET `facility_id` = 1 WHERE `username` = 'staff';

-- Seed staff for Surabaya facility (facility_id = 2) if not exists
INSERT IGNORE INTO `users` (`user_id`, `username`, `password_hash`, `full_name`, `role`, `facility_id`) VALUES
(4, 'staff_sby', 'scrypt$a1b2c3d4e5f60718$3f5a2b1c8d9e0f', 'Surya Pratama', 'STAFF', 2);
