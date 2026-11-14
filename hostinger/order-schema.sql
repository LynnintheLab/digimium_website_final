-- Import customer-auth-schema.sql first. An order, including all its lines, is one atomic record.
CREATE TABLE IF NOT EXISTS digimium_orders (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  customer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash BINARY(32) NOT NULL,
  created_at CHAR(24) CHARACTER SET ascii NOT NULL,
  approved_at CHAR(24) CHARACTER SET ascii NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  snapshot MEDIUMTEXT NOT NULL,
  fulfillment MEDIUMTEXT NULL,
  UNIQUE KEY orders_customer_request (customer_id, request_id),
  INDEX orders_customer_created (customer_id, created_at),
  CONSTRAINT orders_customer FOREIGN KEY (customer_id) REFERENCES digimium_customers (id),
  CHECK (JSON_VALID(snapshot)),
  CHECK ((approved_at IS NULL AND fulfillment IS NULL) OR (approved_at IS NOT NULL AND fulfillment IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
