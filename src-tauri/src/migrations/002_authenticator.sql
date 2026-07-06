CREATE TABLE IF NOT EXISTS authenticator_vault (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  kdf TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  salt TEXT NOT NULL,
  verifier_iv TEXT NOT NULL,
  verifier_ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS totp_accounts (
  id TEXT PRIMARY KEY,
  payload_iv TEXT NOT NULL,
  payload_ciphertext TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_totp_accounts_sort_order ON totp_accounts(sort_order ASC, created_at ASC);
