CREATE TABLE IF NOT EXISTS digimium_giveaway_campaigns (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  slot TINYINT UNSIGNED NOT NULL DEFAULT 1 UNIQUE,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
  is_visible TINYINT UNSIGNED NOT NULL DEFAULT 1,
  starts_at DATETIME(3) NULL,
  ends_at DATETIME(3) NULL,
  launched_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CHECK (slot = 1 AND revision > 0),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
  CHECK (launched_at IS NULL OR (starts_at IS NOT NULL AND ends_at IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS digimium_giveaway_entries (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  campaign_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  customer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  telegram_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  customer_name VARCHAR(100) NOT NULL,
  customer_email VARCHAR(254) COLLATE utf8mb4_bin NULL,
  telegram_username VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  joined_at DATETIME(3) NOT NULL,
  UNIQUE KEY giveaway_customer (campaign_id, customer_id),
  UNIQUE KEY giveaway_telegram (campaign_id, telegram_id),
  INDEX giveaway_joined (campaign_id, joined_at, id),
  CONSTRAINT giveaway_entry_campaign FOREIGN KEY (campaign_id) REFERENCES digimium_giveaway_campaigns(id),
  CONSTRAINT giveaway_entry_customer FOREIGN KEY (customer_id) REFERENCES digimium_customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
