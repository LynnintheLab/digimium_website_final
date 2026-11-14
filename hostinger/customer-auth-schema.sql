CREATE TABLE IF NOT EXISTS digimium_customers (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  password_hash VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS digimium_customer_sessions (
  token_hash BINARY(32) NOT NULL PRIMARY KEY,
  customer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME NOT NULL,
  INDEX (expires_at),
  FOREIGN KEY (customer_id) REFERENCES digimium_customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS digimium_customer_auth_limits (
  bucket BIGINT UNSIGNED NOT NULL,
  scope_hash BINARY(32) NOT NULL,
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, scope_hash)
) ENGINE=InnoDB;
