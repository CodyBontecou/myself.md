CREATE TABLE IF NOT EXISTS tickets(hash TEXT PRIMARY KEY, subject TEXT, purchase TEXT, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS tickets_expiry ON tickets(expires);
CREATE TABLE IF NOT EXISTS accounts(subject TEXT PRIMARY KEY, imported INTEGER NOT NULL);
