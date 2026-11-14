CREATE TABLE IF NOT EXISTS digimium_telegram_auth_challenges (
  id_hash BINARY(32) NOT NULL PRIMARY KEY,
  browser_hash BINARY(32) NOT NULL,
  callback_hash BINARY(32) NULL UNIQUE,
  stage VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  INDEX (expires_at)
) ENGINE=InnoDB;
