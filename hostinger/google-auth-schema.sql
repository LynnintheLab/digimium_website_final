CREATE TABLE IF NOT EXISTS digimium_google_auth_challenges (
  id_hash BINARY(32) NOT NULL PRIMARY KEY,
  browser_hash BINARY(32) NOT NULL,
  stage VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload TEXT NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  INDEX (expires_at)
) ENGINE=InnoDB;
