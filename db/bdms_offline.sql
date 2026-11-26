-- Barangay Ocho Document Management System (BDMS)
-- Offline Local MySQL Schema (Database: bdms_offline)

CREATE DATABASE IF NOT EXISTS `bdms_offline`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `bdms_offline`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) PRIMARY KEY,
  `code` VARCHAR(40) NOT NULL UNIQUE,
  `resident_code` VARCHAR(40) NOT NULL DEFAULT '',
  `full_name` VARCHAR(120) NOT NULL,
  `username` VARCHAR(60) NOT NULL UNIQUE,
  `email` VARCHAR(120) NOT NULL DEFAULT '',
  `role` ENUM('Admin', 'Staff', 'Treasurer') NOT NULL,
  `status` ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
  `date_created` VARCHAR(20) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `residents` (
  `id` VARCHAR(64) PRIMARY KEY,
  `code` VARCHAR(40) NOT NULL UNIQUE,
  `first_name` VARCHAR(80) NOT NULL,
  `middle_name` VARCHAR(80) NOT NULL DEFAULT '',
  `last_name` VARCHAR(80) NOT NULL,
  `suffix` VARCHAR(20) NOT NULL DEFAULT '',
  `sex` ENUM('Male', 'Female') NOT NULL,
  `bday` VARCHAR(20) NOT NULL,
  `age` INT NOT NULL DEFAULT 0,
  `civil_status` VARCHAR(30) NOT NULL,
  `blood_type` VARCHAR(10) NOT NULL DEFAULT 'O+',
  `complete_address` VARCHAR(255) NOT NULL DEFAULT '',
  `purok` VARCHAR(60) NOT NULL,
  `bldg_no` VARCHAR(60) NOT NULL DEFAULT '',
  `street_purok_sector` VARCHAR(120) NOT NULL DEFAULT '',
  `barangay` VARCHAR(100) NOT NULL,
  `city_municipal` VARCHAR(100) NOT NULL,
  `province` VARCHAR(100) NOT NULL,
  `region` VARCHAR(100) NOT NULL,
  `contact_number` VARCHAR(30) NOT NULL DEFAULT '',
  `occupation` VARCHAR(100) NOT NULL DEFAULT '',
  `voter_status` TINYINT(1) NOT NULL DEFAULT 0,
  `pwd_status` TINYINT(1) NOT NULL DEFAULT 0,
  `senior_citizen_status` TINYINT(1) NOT NULL DEFAULT 0,
  `photo_url` VARCHAR(255) NOT NULL DEFAULT '',
  `created_at` VARCHAR(40) NOT NULL,
  `updated_at` VARCHAR(40) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `transactions` (
  `id` VARCHAR(64) PRIMARY KEY,
  `code` VARCHAR(40) NOT NULL UNIQUE,
  `resident_code` VARCHAR(40) NOT NULL,
  `resident_name` VARCHAR(180) NOT NULL,
  `template_code` VARCHAR(40) NOT NULL,
  `document_type` VARCHAR(120) NOT NULL,
  `category` VARCHAR(40) NOT NULL,
  `purpose_type` VARCHAR(120) NOT NULL DEFAULT '',
  `purpose_code` VARCHAR(40) NOT NULL DEFAULT '',
  `purpose` VARCHAR(255) NOT NULL,
  `date_created` VARCHAR(20) NOT NULL,
  `issue_date` VARCHAR(20) NOT NULL DEFAULT '',
  `signed_by` VARCHAR(120) NOT NULL DEFAULT '',
  `processed_by` VARCHAR(120) NOT NULL DEFAULT '',
  `validity` VARCHAR(60) NOT NULL DEFAULT '',
  `remarks` VARCHAR(255) NOT NULL DEFAULT '',
  `is_bypass` TINYINT(1) NOT NULL DEFAULT 0,
  `fee_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `payment_status` VARCHAR(30) NOT NULL,
  `status` VARCHAR(40) NOT NULL,
  `extra_fields` JSON NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `payments` (
  `id` VARCHAR(64) PRIMARY KEY,
  `code` VARCHAR(40) NOT NULL UNIQUE,
  `transaction_code` VARCHAR(40) NOT NULL,
  `res_code` VARCHAR(40) NOT NULL,
  `resident_name` VARCHAR(180) NOT NULL,
  `document_type` VARCHAR(120) NOT NULL,
  `amount` DECIMAL(10, 2) NOT NULL,
  `or_no` VARCHAR(40) NOT NULL,
  `cedula_no` VARCHAR(60) NOT NULL DEFAULT '',
  `payment_method` VARCHAR(40) NOT NULL,
  `payment_date` VARCHAR(20) NOT NULL,
  `received_by` VARCHAR(120) NOT NULL,
  `payment_status` VARCHAR(30) NOT NULL,
  `remarks` VARCHAR(255) NOT NULL DEFAULT ''
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `staff_officials` (
  `id` VARCHAR(64) PRIMARY KEY,
  `code` VARCHAR(40) NOT NULL UNIQUE,
  `res_code` VARCHAR(40) NOT NULL DEFAULT '',
  `full_name` VARCHAR(120) NOT NULL,
  `position` VARCHAR(100) NOT NULL,
  `tier` INT NOT NULL DEFAULT 2,
  `committee` VARCHAR(160) NOT NULL DEFAULT '',
  `reports_to` VARCHAR(40) NOT NULL DEFAULT '',
  `contact_number` VARCHAR(30) NOT NULL DEFAULT '',
  `term_start` VARCHAR(20) NOT NULL DEFAULT '',
  `term_end` VARCHAR(20) NOT NULL DEFAULT '',
  `photo_url` VARCHAR(255) NOT NULL DEFAULT '',
  `status` VARCHAR(20) NOT NULL DEFAULT 'Active'
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `document_templates` (
  `id` VARCHAR(64) PRIMARY KEY,
  `code` VARCHAR(40) NOT NULL UNIQUE,
  `name` VARCHAR(120) NOT NULL,
  `category` VARCHAR(40) NOT NULL,
  `default_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `requires_payment` TINYINT(1) NOT NULL DEFAULT 1,
  `validity_days` INT NOT NULL DEFAULT 180,
  `header_title` VARCHAR(160) NOT NULL,
  `body_template` TEXT NOT NULL,
  `signatory_name` VARCHAR(120) NOT NULL,
  `signatory_title` VARCHAR(80) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `description` VARCHAR(255) NOT NULL DEFAULT ''
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `barangay_settings` (
  `id` INT PRIMARY KEY,
  `barangay_name` VARCHAR(100) NOT NULL,
  `city_municipal` VARCHAR(100) NOT NULL,
  `province` VARCHAR(100) NOT NULL,
  `region` VARCHAR(100) NOT NULL,
  `punong_barangay` VARCHAR(120) NOT NULL,
  `secretary_name` VARCHAR(120) NOT NULL,
  `treasurer_name` VARCHAR(120) NOT NULL,
  `or_prefix` VARCHAR(20) NOT NULL,
  `txn_prefix` VARCHAR(20) NOT NULL,
  `res_prefix` VARCHAR(20) NOT NULL,
  `office_address` VARCHAR(255) NOT NULL,
  `contact_info` VARCHAR(180) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` VARCHAR(64) PRIMARY KEY,
  `timestamp` VARCHAR(40) NOT NULL,
  `actor` VARCHAR(120) NOT NULL,
  `role` VARCHAR(20) NOT NULL,
  `action` VARCHAR(120) NOT NULL,
  `details` VARCHAR(255) NOT NULL
) ENGINE=InnoDB;
