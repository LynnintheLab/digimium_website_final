CREATE TABLE IF NOT EXISTS digimium_runninghub_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  methods TEXT NOT NULL,
  CHECK (JSON_VALID(methods))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS digimium_runninghub_stock (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  pack_id VARCHAR(8) CHARACTER SET ascii NOT NULL,
  key_hash BINARY(32) NOT NULL UNIQUE,
  key_cipher MEDIUMTEXT NOT NULL,
  key_name VARCHAR(100) NULL,
  reserved_order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
  issued_order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
  retired TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at CHAR(24) CHARACTER SET ascii NOT NULL,
  INDEX runninghub_stock_available (pack_id, retired, reserved_order_id, issued_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS digimium_runninghub_orders (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  customer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash BINARY(32) NOT NULL,
  pack_id VARCHAR(8) CHARACTER SET ascii NOT NULL,
  pack_label VARCHAR(40) NOT NULL,
  price_mmk INT UNSIGNED NOT NULL,
  status VARCHAR(24) CHARACTER SET ascii NOT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  created_at CHAR(24) CHARACTER SET ascii NOT NULL,
  expires_at CHAR(24) CHARACTER SET ascii NULL,
  approved_at CHAR(24) CHARACTER SET ascii NULL,
  payment TEXT NOT NULL,
  stock_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  proof_request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  proof_hash BINARY(32) NULL,
  proof_mime VARCHAR(32) CHARACTER SET ascii NULL,
  proof_cipher MEDIUMBLOB NULL,
  delivery_cipher MEDIUMTEXT NULL,
  key_name VARCHAR(100) NULL,
  note VARCHAR(1000) NOT NULL DEFAULT '',
  UNIQUE KEY runninghub_customer_request (customer_id, request_id),
  INDEX runninghub_customer_created (customer_id, created_at),
  INDEX runninghub_pending_expiry (status, expires_at),
  CONSTRAINT runninghub_order_customer FOREIGN KEY (customer_id) REFERENCES digimium_customers(id) ON DELETE CASCADE,
  CHECK (JSON_VALID(payment))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS digimium_runninghub_requests (
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  request_hash BINARY(32) NOT NULL,
  result TEXT NOT NULL,
  created_at CHAR(24) CHARACTER SET ascii NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS digimium_runninghub_payments (
  method VARCHAR(8) CHARACTER SET ascii NOT NULL,
  reference_hash BINARY(32) NOT NULL,
  order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  created_at CHAR(24) CHARACTER SET ascii NOT NULL,
  PRIMARY KEY (method, reference_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS digimium_runninghub_audit (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  event VARCHAR(32) CHARACTER SET ascii NOT NULL,
  order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  key_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  actor_hash BINARY(32) NULL,
  created_at CHAR(24) CHARACTER SET ascii NOT NULL,
  INDEX runninghub_audit_order (order_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS digimium_runninghub_admin_outbox (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  proof_request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  lease_token BINARY(16) NULL,
  lease_until DATETIME(3) NULL,
  sent_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  last_error VARCHAR(32) CHARACTER SET ascii NULL,
  UNIQUE KEY runninghub_admin_receipt (order_id, proof_request_id),
  INDEX runninghub_admin_outbox_due (sent_at, cancelled_at, next_attempt_at, lease_until),
  CONSTRAINT runninghub_admin_outbox_order FOREIGN KEY (order_id) REFERENCES digimium_runninghub_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS digimium_runninghub_approval_outbox (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  lease_token BINARY(16) NULL,
  lease_until DATETIME(3) NULL,
  sent_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  last_error VARCHAR(32) CHARACTER SET ascii NULL,
  INDEX runninghub_approval_outbox_due (sent_at, cancelled_at, next_attempt_at, lease_until),
  CONSTRAINT runninghub_approval_outbox_order FOREIGN KEY (order_id) REFERENCES digimium_runninghub_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
