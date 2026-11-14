-- Stable numeric Telegram users own accounts independently of mutable names/usernames.
CREATE TABLE IF NOT EXISTS digimium_telegram_identities (
  telegram_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  customer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  username VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT telegram_identity_customer FOREIGN KEY (customer_id) REFERENCES digimium_customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;
