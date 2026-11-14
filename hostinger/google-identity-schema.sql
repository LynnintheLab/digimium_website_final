-- Google subjects identify accounts independently of mutable profile email addresses.
CREATE TABLE IF NOT EXISTS digimium_google_identities (
  google_sub VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  customer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX google_identity_customer (customer_id),
  CONSTRAINT google_identity_customer FOREIGN KEY (customer_id) REFERENCES digimium_customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;
