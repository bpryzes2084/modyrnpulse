-- Already applied to the modyrnpulse-signups D1 database.
CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT
);
