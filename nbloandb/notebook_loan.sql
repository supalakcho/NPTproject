-- =====================================================================
--  ระบบยืมคืนโน๊ตบุ๊ค (Notebook Loan System) - Database Script
--  เวอร์ชัน : 1.0  (ตาม Database Design Phase 1 ที่ปรับล่าสุด)
--  รองรับ  : MariaDB 10.4+ (XAMPP) / MySQL 8.0.16+
--  ระดับ   : ผ่าน Normal Form ระดับ 3 (3NF)
--
--  วิธีใช้ใน phpMyAdmin:
--    1. เปิด phpMyAdmin > แท็บ Import (ที่ระดับ Server ไม่ต้องเลือกฐานข้อมูลก่อน)
--    2. เลือกไฟล์นี้ แล้วกด Import
--    3. สคริปต์จะสร้างฐานข้อมูล `notebook_loan` ให้อัตโนมัติ
--    * import ซ้ำได้ สคริปต์จะลบตารางเดิมแล้วสร้างใหม่ (ข้อมูลเดิมหายทั้งหมด)
--
--  บัญชีตัวอย่าง (เปลี่ยนรหัสผ่านทันทีหลังติดตั้ง):
--    แอดมิน : admin@example.com  / Admin@1234
--    สมาชิก : member@example.com / Member@1234
--
--  หลักการออกแบบสำคัญ:
--    - ไม่เก็บสถานะ ว่าง/ยืม/จอง/เกินกำหนด ลงตาราง แต่คำนวณผ่าน View
--      (v_loans, v_notebook_status) เพื่อไม่ให้ข้อมูลขัดกันและผ่าน 3NF
--    - กันการยืมเครื่องเดียวซ้อนกันในระดับ DB ด้วย generated column
--      loans.active_notebook_id + UNIQUE
--    - ตารางข้อมูลหลักใช้ Soft Delete (deleted_at)
--    - ตารางธุรกรรม (reservations, loans) ใช้การยกเลิกแทนการลบ
--    - เวลาทั้งหมดเป็นเวลาไทย (UTC+7) ให้ตั้ง timezone ที่ connection
--      ของ Node.js เช่น  timezone: '+07:00'
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+07:00';
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `notebook_loan`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE `notebook_loan`;

-- ลบของเดิม (ทำให้ import ซ้ำได้)
DROP VIEW  IF EXISTS `v_loan_monthly_summary`;
DROP VIEW  IF EXISTS `v_notebook_status`;
DROP VIEW  IF EXISTS `v_loans`;
DROP TABLE IF EXISTS `audit_logs`;
DROP TABLE IF EXISTS `settings`;
DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `loans`;
DROP TABLE IF EXISTS `reservations`;
DROP TABLE IF EXISTS `notebooks`;
DROP TABLE IF EXISTS `notebook_models`;
DROP TABLE IF EXISTS `brands`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `role_permissions`;
DROP TABLE IF EXISTS `permissions`;
DROP TABLE IF EXISTS `roles`;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
--  กลุ่ม 1: ผู้ใช้และสิทธิ์ (RBAC)
-- =====================================================================

-- บทบาทผู้ใช้ เช่น admin, member
CREATE TABLE `roles` (
  `id`          TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(30)  NOT NULL COMMENT 'รหัสใช้ในโค้ด เช่น admin, member',
  `name`        VARCHAR(100) NOT NULL COMMENT 'ชื่อแสดงผล',
  `description` VARCHAR(255) NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='บทบาทผู้ใช้';

-- สิทธิ์การทำงาน รูปแบบ module.action
CREATE TABLE `permissions` (
  `id`         SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`       VARCHAR(60)  NOT NULL COMMENT 'เช่น notebook.create, loan.receive',
  `name`       VARCHAR(100) NOT NULL,
  `module`     VARCHAR(30)  NOT NULL COMMENT 'กลุ่มของสิทธิ์',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_permissions_code` (`code`),
  KEY `idx_permissions_module` (`module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='สิทธิ์การทำงาน';

-- ตารางเชื่อม Many-to-Many ระหว่าง roles กับ permissions
CREATE TABLE `role_permissions` (
  `role_id`       TINYINT UNSIGNED  NOT NULL,
  `permission_id` SMALLINT UNSIGNED NOT NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`, `permission_id`),
  KEY `idx_rp_permission` (`permission_id`),
  CONSTRAINT `fk_rp_role` FOREIGN KEY (`role_id`)
    REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_rp_permission` FOREIGN KEY (`permission_id`)
    REFERENCES `permissions` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='สิทธิ์ของแต่ละ role';

-- บัญชีผู้ใช้ (แอดมินและสมาชิก) รวมข้อมูลโปรไฟล์
CREATE TABLE `users` (
  `id`            INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `role_id`       TINYINT UNSIGNED NOT NULL,
  `member_code`   VARCHAR(20)  NULL COMMENT 'รหัสนักศึกษา/พนักงาน',
  `email`         VARCHAR(150) NOT NULL COMMENT 'ใช้ login',
  `password_hash` CHAR(60)     NOT NULL COMMENT 'bcrypt hash ห้ามเก็บ plain text',
  `first_name`    VARCHAR(100) NOT NULL,
  `last_name`     VARCHAR(100) NOT NULL,
  `phone`         VARCHAR(15)  NOT NULL,
  `avatar_path`   VARCHAR(255) NULL,
  `is_active`     TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '0 = ถูกระงับบัญชี',
  `last_login_at` DATETIME NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`    DATETIME NULL COMMENT 'Soft delete',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_member_code` (`member_code`),
  KEY `idx_users_role` (`role_id`),
  KEY `idx_users_deleted` (`deleted_at`),
  CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`)
    REFERENCES `roles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_users_active` CHECK (`is_active` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='บัญชีผู้ใช้และโปรไฟล์';

-- =====================================================================
--  กลุ่ม 2: อุปกรณ์ (แยก ยี่ห้อ > รุ่น > เครื่อง เพื่อผ่าน 3NF)
-- =====================================================================

CREATE TABLE `brands` (
  `id`         SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(50) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL COMMENT 'Soft delete',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_brands_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='ยี่ห้อโน๊ตบุ๊ค';

-- รุ่นและสเปก (สเปกขึ้นกับรุ่น ไม่ได้ขึ้นกับเครื่อง)
CREATE TABLE `notebook_models` (
  `id`          INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  `brand_id`    SMALLINT UNSIGNED NOT NULL,
  `model_name`  VARCHAR(100) NOT NULL,
  `cpu`         VARCHAR(100) NOT NULL,
  `ram_gb`      SMALLINT UNSIGNED NOT NULL,
  `storage_gb`  SMALLINT UNSIGNED NOT NULL,
  `screen_inch` DECIMAL(3,1) NOT NULL,
  `os`          VARCHAR(50)  NOT NULL,
  `image_path`  VARCHAR(255) NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`  DATETIME NULL COMMENT 'Soft delete',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_models_brand_name` (`brand_id`, `model_name`),
  KEY `idx_models_deleted` (`deleted_at`),
  CONSTRAINT `fk_models_brand` FOREIGN KEY (`brand_id`)
    REFERENCES `brands` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_models_ram`     CHECK (`ram_gb` BETWEEN 1 AND 256),
  CONSTRAINT `chk_models_storage` CHECK (`storage_gb` BETWEEN 32 AND 8192),
  CONSTRAINT `chk_models_screen`  CHECK (`screen_inch` BETWEEN 10.0 AND 18.0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='รุ่นและสเปกโน๊ตบุ๊ค';

-- โน๊ตบุ๊คแต่ละเครื่อง (1 แถว = 1 เครื่องจริง)
-- สถานะ ว่าง/ยืม/จอง ไม่เก็บที่นี่ ดูจาก View v_notebook_status
CREATE TABLE `notebooks` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `model_id`         INT UNSIGNED NOT NULL,
  `asset_code`       VARCHAR(30)  NOT NULL COMMENT 'รหัสครุภัณฑ์ = ค่าใน barcode',
  `serial_number`    VARCHAR(50)  NOT NULL,
  `condition_status` ENUM('normal','damaged','maintenance','retired') NOT NULL DEFAULT 'normal'
                     COMMENT 'สภาพเครื่อง: ปกติ/เสียหาย/ซ่อมบำรุง/ปลดระวาง',
  `condition_note`   VARCHAR(255) NULL,
  `purchased_at`     DATE NULL,
  `created_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`       DATETIME NULL COMMENT 'Soft delete',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notebooks_asset_code` (`asset_code`),
  UNIQUE KEY `uq_notebooks_serial` (`serial_number`),
  KEY `idx_notebooks_model` (`model_id`),
  KEY `idx_notebooks_condition` (`condition_status`, `deleted_at`),
  CONSTRAINT `fk_notebooks_model` FOREIGN KEY (`model_id`)
    REFERENCES `notebook_models` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='โน๊ตบุ๊คแต่ละเครื่อง';

-- =====================================================================
--  กลุ่ม 3: ธุรกรรม (จองล่วงหน้า และ ยืม-คืน)
-- =====================================================================

-- การจองล่วงหน้าเป็นช่วงเวลา (ล่วงหน้าไม่เกิน 7 วัน ตรวจที่ backend)
-- สถานะคำนวณจาก cancelled_at, เวลา และการมี loan อ้างถึง
CREATE TABLE `reservations` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       INT UNSIGNED NOT NULL COMMENT 'ผู้จอง',
  `notebook_id`   INT UNSIGNED NOT NULL,
  `start_at`      DATETIME NOT NULL,
  `end_at`        DATETIME NOT NULL,
  `cancelled_at`  DATETIME NULL,
  `cancelled_by`  INT UNSIGNED NULL COMMENT 'สมาชิกเองหรือแอดมิน',
  `cancel_reason` VARCHAR(255) NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_res_id_user_notebook` (`id`, `user_id`, `notebook_id`),
  KEY `idx_res_notebook_time` (`notebook_id`, `start_at`, `end_at`),
  KEY `idx_res_user_start` (`user_id`, `start_at`),
  KEY `idx_res_cancelled_by` (`cancelled_by`),
  CONSTRAINT `fk_res_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_res_notebook` FOREIGN KEY (`notebook_id`)
    REFERENCES `notebooks` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_res_cancelled_by` FOREIGN KEY (`cancelled_by`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- ช่วงจองต้องถูกต้องและยาวไม่เกิน 24 ชั่วโมง
  CONSTRAINT `chk_res_period` CHECK (`end_at` > `start_at`
                                     AND `end_at` <= `start_at` + INTERVAL 24 HOUR),
  -- ยกเลิกแล้วต้องระบุผู้ยกเลิกเสมอ
  CONSTRAINT `chk_res_cancel` CHECK ((`cancelled_at` IS NULL) = (`cancelled_by` IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='การจองล่วงหน้า';

-- การยืม-คืน
--  ขั้นตอนคืน: สมาชิกกดคืน (return_requested_at)
--              > แอดมินยืนยันรับเครื่องและตรวจสภาพ (returned_at, received_by)
--  ต่อเวลา   : UPDATE due_at ของแถวเดิม (รวมไม่เกิน 24 ชม. นับจาก borrowed_at)
CREATE TABLE `loans` (
  `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`             INT UNSIGNED NOT NULL COMMENT 'ผู้ยืม',
  `notebook_id`         INT UNSIGNED NOT NULL,
  `reservation_id`      INT UNSIGNED NULL COMMENT 'NULL = ยืมทันทีไม่ได้จอง',
  `borrowed_at`         DATETIME NOT NULL,
  `due_at`              DATETIME NOT NULL COMMENT 'กำหนดคืนปัจจุบัน',
  `return_requested_at` DATETIME NULL COMMENT 'เวลาที่สมาชิกกดคืน',
  `returned_at`         DATETIME NULL COMMENT 'เวลาที่แอดมินยืนยันรับเครื่อง',
  `received_by`         INT UNSIGNED NULL COMMENT 'แอดมินผู้รับคืน',
  `return_condition`    ENUM('normal','damaged') NULL COMMENT 'สภาพตอนรับคืน',
  `return_note`         VARCHAR(255) NULL,
  `cancelled_at`        DATETIME NULL,
  `cancelled_by`        INT UNSIGNED NULL,
  `cancel_reason`       VARCHAR(255) NULL,
  -- มีค่า = เครื่องนี้กำลังถูกยืม (ยังไม่ได้รับคืนและไม่ถูกยกเลิก)
  -- ใช้ทำ UNIQUE เพื่อกันการยืมเครื่องเดียวซ้อนกันในระดับฐานข้อมูล
  `active_notebook_id`  INT UNSIGNED AS (
                          IF(`returned_at` IS NULL AND `cancelled_at` IS NULL, `notebook_id`, NULL)
                        ) STORED,
  `created_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_loans_reservation` (`reservation_id`),
  UNIQUE KEY `uq_loans_active_notebook` (`active_notebook_id`),
  KEY `idx_loans_res_user_nb` (`reservation_id`, `user_id`, `notebook_id`),
  KEY `idx_loans_user_borrowed` (`user_id`, `borrowed_at`),
  KEY `idx_loans_notebook` (`notebook_id`),
  KEY `idx_loans_open_due` (`returned_at`, `cancelled_at`, `due_at`),
  KEY `idx_loans_return_pending` (`returned_at`, `return_requested_at`),
  KEY `idx_loans_borrowed` (`borrowed_at`),
  KEY `idx_loans_received_by` (`received_by`),
  KEY `idx_loans_cancelled_by` (`cancelled_by`),
  CONSTRAINT `fk_loans_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_loans_notebook` FOREIGN KEY (`notebook_id`)
    REFERENCES `notebooks` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- composite FK: ผู้ยืมและเครื่องต้องตรงกับการจองต้นทาง
  CONSTRAINT `fk_loans_reservation` FOREIGN KEY (`reservation_id`, `user_id`, `notebook_id`)
    REFERENCES `reservations` (`id`, `user_id`, `notebook_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_loans_received_by` FOREIGN KEY (`received_by`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_loans_cancelled_by` FOREIGN KEY (`cancelled_by`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- ยืมรวมต่อเวลาแล้วไม่เกิน 24 ชั่วโมง
  CONSTRAINT `chk_loans_due` CHECK (`due_at` > `borrowed_at`
                                    AND `due_at` <= `borrowed_at` + INTERVAL 24 HOUR),
  CONSTRAINT `chk_loans_request` CHECK (`return_requested_at` IS NULL
                                        OR `return_requested_at` >= `borrowed_at`),
  CONSTRAINT `chk_loans_returned` CHECK (`returned_at` IS NULL OR `returned_at` >= `borrowed_at`),
  -- รายการเดียวจะ "คืนแล้ว" และ "ยกเลิก" พร้อมกันไม่ได้
  CONSTRAINT `chk_loans_return_or_cancel` CHECK (`returned_at` IS NULL OR `cancelled_at` IS NULL),
  -- รับคืนแล้วต้องระบุแอดมินผู้รับและสภาพเครื่อง
  CONSTRAINT `chk_loans_receive` CHECK (`returned_at` IS NULL
                                        OR (`received_by` IS NOT NULL AND `return_condition` IS NOT NULL)),
  CONSTRAINT `chk_loans_cancel` CHECK ((`cancelled_at` IS NULL) = (`cancelled_by` IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='การยืม-คืน';

-- =====================================================================
--  กลุ่ม 4: ระบบ (แจ้งเตือน, ค่าตั้งค่า, Audit Trail)
-- =====================================================================

-- แจ้งเตือนในระบบ สร้างโดย scheduled job
-- ไม่เก็บ user_id และข้อความ เพราะหาได้จาก loan/reservation และ type (3NF)
CREATE TABLE `notifications` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `loan_id`        INT UNSIGNED NULL,
  `reservation_id` INT UNSIGNED NULL,
  `type`           ENUM('loan_due_soon','loan_overdue','loan_cancelled',
                        'reservation_starting','reservation_cancelled') NOT NULL,
  `ref_due_at`     DATETIME NULL COMMENT 'กำหนดคืนที่แจ้งเตือนครั้งนี้อ้างถึง',
  `read_at`        DATETIME NULL COMMENT 'NULL = ยังไม่อ่าน',
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notif_loan_type_due` (`loan_id`, `type`, `ref_due_at`),
  UNIQUE KEY `uq_notif_res_type` (`reservation_id`, `type`),
  KEY `idx_notif_created` (`created_at`),
  CONSTRAINT `fk_notif_loan` FOREIGN KEY (`loan_id`)
    REFERENCES `loans` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_notif_reservation` FOREIGN KEY (`reservation_id`)
    REFERENCES `reservations` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- ต้องอ้างอิง loan หรือ reservation อย่างใดอย่างหนึ่งเท่านั้น
  CONSTRAINT `chk_notif_target` CHECK ((`loan_id` IS NULL) <> (`reservation_id` IS NULL)),
  -- type ต้องสอดคล้องกับสิ่งที่อ้างอิง
  CONSTRAINT `chk_notif_type` CHECK (
       (`type` IN ('loan_due_soon','loan_overdue','loan_cancelled') AND `loan_id` IS NOT NULL)
    OR (`type` IN ('reservation_starting','reservation_cancelled') AND `reservation_id` IS NOT NULL)),
  -- แจ้งเตือนเรื่องกำหนดคืนต้องระบุ ref_due_at (แจ้งใหม่ได้หลังต่อเวลา)
  CONSTRAINT `chk_notif_due` CHECK (`type` NOT IN ('loan_due_soon','loan_overdue')
                                    OR `ref_due_at` IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='แจ้งเตือนในระบบ';

-- ค่ากฎธุรกิจที่แอดมินปรับได้
CREATE TABLE `settings` (
  `setting_key`   VARCHAR(50)  NOT NULL,
  `setting_value` VARCHAR(255) NOT NULL,
  `value_type`    ENUM('int','bool','string') NOT NULL,
  `description`   VARCHAR(255) NOT NULL,
  `updated_by`    INT UNSIGNED NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`),
  KEY `idx_settings_updated_by` (`updated_by`),
  CONSTRAINT `fk_settings_updated_by` FOREIGN KEY (`updated_by`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='ค่าตั้งค่าระบบ';

-- Audit Trail (append-only: แอปห้าม UPDATE/DELETE)
CREATE TABLE `audit_logs` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`      INT UNSIGNED NULL COMMENT 'NULL = ยังไม่ login เช่น login ไม่สำเร็จ',
  `action`       ENUM('LOGIN_SUCCESS','LOGIN_FAILED','LOGOUT','REGISTER',
                      'CREATE','UPDATE','DELETE','PERMISSION_DENIED') NOT NULL,
  `target_table` VARCHAR(50)  NULL,
  `target_id`    INT UNSIGNED NULL,
  `old_values`   JSON NULL COMMENT 'ค่าก่อนแก้ (ห้ามเก็บ password_hash)',
  `new_values`   JSON NULL COMMENT 'ค่าหลังแก้ / อีเมลที่พยายาม login',
  `ip_address`   VARCHAR(45)  NOT NULL COMMENT 'รองรับ IPv6',
  `user_agent`   VARCHAR(255) NULL,
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_user_time` (`user_id`, `created_at`),
  KEY `idx_audit_target` (`target_table`, `target_id`),
  KEY `idx_audit_action_time` (`action`, `created_at`),
  CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Audit Trail';

-- =====================================================================
--  VIEWS: สถานะที่คำนวณได้ และรายงาน
-- =====================================================================

-- สถานะของการยืมแต่ละรายการ
--   loan_status : borrowing / overdue / return_pending / returned / cancelled
--   is_late     : 1 = คืนช้า (ใช้เวลาที่สมาชิกกดคืน ถ้าไม่ได้กดใช้เวลาที่แอดมินรับคืน)
CREATE VIEW `v_loans` AS
SELECT
  l.*,
  CASE
    WHEN l.cancelled_at        IS NOT NULL THEN 'cancelled'
    WHEN l.returned_at         IS NOT NULL THEN 'returned'
    WHEN l.return_requested_at IS NOT NULL THEN 'return_pending'
    WHEN NOW() > l.due_at                  THEN 'overdue'
    ELSE 'borrowing'
  END AS loan_status,
  (l.cancelled_at IS NULL
   AND COALESCE(l.return_requested_at, l.returned_at, NOW()) > l.due_at) AS is_late
FROM loans l;

-- สถานะปัจจุบันของโน๊ตบุ๊ค
--   current_status : available / borrowed / reserved / damaged / maintenance / retired
--   reserved = มีการจองที่ครอบเวลาปัจจุบัน ยังไม่ยกเลิก ยังไม่เลยเวลาผ่อนผัน และยังไม่ได้รับเครื่อง
CREATE VIEW `v_notebook_status` AS
SELECT
  n.id,
  n.asset_code,
  n.serial_number,
  n.model_id,
  m.model_name,
  b.name AS brand_name,
  n.condition_status,
  CASE
    WHEN n.condition_status <> 'normal' THEN n.condition_status
    WHEN EXISTS (SELECT 1 FROM loans l
                 WHERE l.active_notebook_id = n.id) THEN 'borrowed'
    WHEN EXISTS (SELECT 1 FROM reservations r
                 WHERE r.notebook_id = n.id
                   AND r.cancelled_at IS NULL
                   AND NOW() >= r.start_at
                   AND NOW() <  r.end_at
                   AND TIMESTAMPDIFF(MINUTE, r.start_at, NOW()) <=
                       (SELECT CAST(s.setting_value AS UNSIGNED) FROM settings s
                        WHERE s.setting_key = 'reservation_grace_minutes')
                   AND NOT EXISTS (SELECT 1 FROM loans l2
                                   WHERE l2.reservation_id = r.id)) THEN 'reserved'
    ELSE 'available'
  END AS current_status
FROM notebooks n
JOIN notebook_models m ON m.id = n.model_id
JOIN brands b          ON b.id = m.brand_id
WHERE n.deleted_at IS NULL;

-- รายงานจำนวนการยืมต่อเดือน (ไม่นับรายการที่ถูกยกเลิก)
CREATE VIEW `v_loan_monthly_summary` AS
SELECT
  DATE_FORMAT(borrowed_at, '%Y-%m') AS loan_month,
  COUNT(*) AS total_loans,
  SUM(COALESCE(return_requested_at, returned_at, NOW()) > due_at) AS late_loans
FROM loans
WHERE cancelled_at IS NULL
GROUP BY DATE_FORMAT(borrowed_at, '%Y-%m');

-- =====================================================================
--  SEED DATA: ข้อมูลเริ่มต้น
-- =====================================================================

INSERT INTO `roles` (`id`, `code`, `name`, `description`) VALUES
  (1, 'admin',  'แอดมิน', 'จัดการระบบได้ทั้งหมด'),
  (2, 'member', 'สมาชิก', 'ยืม จอง คืน และดูประวัติของตัวเอง');

INSERT INTO `permissions` (`id`, `code`, `name`, `module`) VALUES
  ( 1, 'notebook.view',             'ดูรายการโน๊ตบุ๊ค',            'notebook'),
  ( 2, 'notebook.create',           'เพิ่มโน๊ตบุ๊ค',                'notebook'),
  ( 3, 'notebook.update',           'แก้ไขโน๊ตบุ๊ค',                'notebook'),
  ( 4, 'notebook.delete',           'ลบโน๊ตบุ๊ค',                  'notebook'),
  ( 5, 'brand.manage',              'จัดการยี่ห้อ',                'notebook'),
  ( 6, 'model.manage',              'จัดการรุ่นและสเปก',           'notebook'),
  ( 7, 'loan.create',               'ยืมโน๊ตบุ๊ค',                 'loan'),
  ( 8, 'loan.view_own',             'ดูประวัติยืมของตัวเอง',        'loan'),
  ( 9, 'loan.view_all',             'ดูประวัติยืมของทุกคน',         'loan'),
  (10, 'loan.return_request',       'กดคืนโน๊ตบุ๊ค',               'loan'),
  (11, 'loan.extend',               'ต่อเวลายืม',                 'loan'),
  (12, 'loan.receive',              'ยืนยันรับคืนและตรวจสภาพ',      'loan'),
  (13, 'loan.cancel',               'ยกเลิกรายการยืม',             'loan'),
  (14, 'reservation.create',        'จองล่วงหน้า',                'reservation'),
  (15, 'reservation.view_own',      'ดูการจองของตัวเอง',           'reservation'),
  (16, 'reservation.view_all',      'ดูการจองของทุกคน',            'reservation'),
  (17, 'reservation.cancel_own',    'ยกเลิกการจองของตัวเอง',        'reservation'),
  (18, 'reservation.cancel_any',    'ยกเลิกการจองของทุกคน',         'reservation'),
  (19, 'user.update_own',           'แก้ไขโปรไฟล์ของตัวเอง',        'user'),
  (20, 'user.view_all',             'ดูข้อมูลสมาชิกทั้งหมด',         'user'),
  (21, 'user.update_any',           'แก้ไข/ระงับบัญชีสมาชิก',        'user'),
  (22, 'notification.view_own',     'ดูแจ้งเตือนของตัวเอง',         'notification'),
  (23, 'report.view',               'ดูรายงาน',                   'report'),
  (24, 'setting.manage',            'แก้ไขค่าตั้งค่าระบบ',           'setting'),
  (25, 'audit.view',                'ดู Audit Log',               'audit');

-- แอดมินได้ทุกสิทธิ์
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, `id` FROM `permissions`;

-- สมาชิกได้เฉพาะสิทธิ์ที่เกี่ยวกับตัวเอง
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 2, `id` FROM `permissions`
WHERE `code` IN ('notebook.view', 'loan.create', 'loan.view_own', 'loan.return_request',
                 'loan.extend', 'reservation.create', 'reservation.view_own',
                 'reservation.cancel_own', 'user.update_own', 'notification.view_own');

-- บัญชีตัวอย่าง (bcrypt cost 10)  Admin@1234 / Member@1234
INSERT INTO `users` (`id`, `role_id`, `member_code`, `email`, `password_hash`,
                     `first_name`, `last_name`, `phone`) VALUES
  (1, 1, NULL,       'admin@example.com',
   '$2b$10$HCGW5zHpJb4QemnLhXAFbO2po7QtlQftP4RfjlkkAA0qbLe3hl.Mm',
   'ผู้ดูแล', 'ระบบ', '0800000000'),
  (2, 2, '65000001', 'member@example.com',
   '$2b$10$qyuvmnqdMEtCRvwlmpd4aefuMvZ3nc7/H3vjXtt9msyMuRkEVX3cO',
   'สมชาย', 'ใจดี', '0812345678');

INSERT INTO `settings` (`setting_key`, `setting_value`, `value_type`, `description`) VALUES
  ('max_loan_hours',             '24', 'int', 'ยืมได้นานสุด (ชั่วโมง) รวมการต่อเวลา ต้องไม่เกิน 24'),
  ('reservation_max_days_ahead', '7',  'int', 'จองล่วงหน้าได้ไม่เกิน (วัน)'),
  ('reservation_grace_minutes',  '30', 'int', 'ไม่มารับเครื่องภายในกี่นาทีหลังเวลาเริ่ม ถือว่าการจองหมดอายุ'),
  ('reminder_before_minutes',    '60', 'int', 'แจ้งเตือนก่อนครบกำหนดคืนกี่นาที'),
  ('max_active_loans_per_user',  '1',  'int', 'สมาชิก 1 คนยืมพร้อมกันได้สูงสุดกี่เครื่อง');

-- ข้อมูลอุปกรณ์ตัวอย่าง (ลบออกได้ก่อนใช้งานจริง)
INSERT INTO `brands` (`id`, `name`) VALUES
  (1, 'Lenovo'), (2, 'Acer'), (3, 'Dell');

INSERT INTO `notebook_models`
  (`id`, `brand_id`, `model_name`, `cpu`, `ram_gb`, `storage_gb`, `screen_inch`, `os`) VALUES
  (1, 1, 'ThinkPad E14 Gen 5', 'Intel Core i5-1335U', 16, 512, 14.0, 'Windows 11 Pro'),
  (2, 2, 'Aspire 5 A515-58',   'Intel Core i5-1335U',  8, 512, 15.6, 'Windows 11 Home'),
  (3, 3, 'Latitude 3440',      'Intel Core i5-1345U', 16, 256, 14.0, 'Windows 11 Pro');

INSERT INTO `notebooks` (`model_id`, `asset_code`, `serial_number`, `condition_status`, `purchased_at`) VALUES
  (1, 'NB-0001', 'PF4ABC01', 'normal',      '2025-06-01'),
  (1, 'NB-0002', 'PF4ABC02', 'normal',      '2025-06-01'),
  (2, 'NB-0003', 'NXK6EX03', 'normal',      '2025-08-15'),
  (3, 'NB-0004', 'DL3440X4', 'normal',      '2026-01-10'),
  (3, 'NB-0005', 'DL3440X5', 'maintenance', '2026-01-10');

-- จบสคริปต์
