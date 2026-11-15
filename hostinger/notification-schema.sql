-- Customer tables must exist first. This schema never seeds notifications or sends messages.
CREATE TABLE IF NOT EXISTS digimium_notifications (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  customer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  dedupe_key VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind VARCHAR(16) CHARACTER SET ascii NOT NULL,
  title VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  body_my TEXT NULL,
  action_label VARCHAR(60) NULL,
  action_url VARCHAR(2048) NULL,
  order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  read_at DATETIME(3) NULL,
  UNIQUE KEY notifications_customer_dedupe (customer_id, dedupe_key),
  INDEX notifications_customer_created (customer_id, created_at, id),
  INDEX notifications_customer_unread (customer_id, read_at),
  CONSTRAINT notifications_customer FOREIGN KEY (customer_id) REFERENCES digimium_customers (id) ON DELETE CASCADE,
  CHECK (kind IN ('message', 'expiry'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS digimium_notification_outbox (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  dedupe_key VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind VARCHAR(32) CHARACTER SET ascii NOT NULL,
  entity_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  lease_token BINARY(16) NULL,
  lease_until DATETIME(3) NULL,
  sent_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  last_error VARCHAR(32) CHARACTER SET ascii NULL,
  UNIQUE KEY notification_outbox_dedupe (dedupe_key),
  INDEX notification_outbox_due (sent_at, next_attempt_at, lease_until),
  CHECK (JSON_VALID(payload))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS digimium_notification_jobs (
  name VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  cursor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  cursor_line INT UNSIGNED NOT NULL DEFAULT 0,
  scan_day CHAR(10) CHARACTER SET ascii NULL,
  last_run_at DATETIME(3) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
