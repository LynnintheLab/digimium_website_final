-- Select the application's database in phpMyAdmin, then import this file.
-- Safe to import again. Existing catalog entries and uploaded logos are preserved.
CREATE TABLE IF NOT EXISTS digimium_catalog (
  id VARCHAR(4) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  revision BIGINT UNSIGNED NOT NULL,
  updated_at CHAR(24) CHARACTER SET ascii NOT NULL,
  payload MEDIUMTEXT NOT NULL,
  CHECK (id = 'main' AND revision > 0 AND JSON_VALID(payload))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS digimium_logos (
  object_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  image_bytes MEDIUMBLOB NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS digimium_admin_sessions (
  token_hash BINARY(32) NOT NULL PRIMARY KEY,
  expires_at DATETIME NOT NULL,
  INDEX (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS digimium_login_limits (
  window_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS digimium_otp_challenges (
  challenge_hash BINARY(32) NOT NULL PRIMARY KEY,
  code_hash BINARY(32) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts_left TINYINT UNSIGNED NOT NULL DEFAULT 5,
  INDEX (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS digimium_otp_send_limit (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  last_sent_at DATETIME NULL,
  window_start DATETIME NOT NULL,
  sends TINYINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;
