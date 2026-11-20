-- Member accounts for modyrnpulse.com (modyrnpulse-members D1 database).

CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT
);

CREATE TABLE IF NOT EXISTS members (
  email TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  square_customer_id TEXT,
  sub_active INTEGER NOT NULL DEFAULT 0,
  sub_checked_at INTEGER NOT NULL DEFAULT 0,
  sub_last_active_at INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  reset_code TEXT,
  reset_expires INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_email ON sessions(email);

-- Checkouts started on /join, matched up when Square sends the buyer back to /welcome.
CREATE TABLE IF NOT EXISTS pending_checkouts (
  order_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  plan_name TEXT,
  created_at INTEGER NOT NULL
);
