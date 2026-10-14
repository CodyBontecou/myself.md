CREATE TABLE IF NOT EXISTS reviewer_access (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  token_valid_after INTEGER NOT NULL
);
