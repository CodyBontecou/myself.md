CREATE TABLE IF NOT EXISTS analytics_preferences (
  actor TEXT PRIMARY KEY, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS analytics_aliases (
  anonymous TEXT PRIMARY KEY, actor TEXT NOT NULL, updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS analytics_alias_actor ON analytics_aliases(actor);
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY, actor TEXT, anonymous TEXT NOT NULL, name TEXT NOT NULL,
  at INTEGER NOT NULL, received INTEGER NOT NULL, surface TEXT NOT NULL,
  step TEXT, verified INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS analytics_events_time ON analytics_events(at);
CREATE INDEX IF NOT EXISTS analytics_events_actor ON analytics_events(actor,at);
CREATE INDEX IF NOT EXISTS analytics_events_anonymous ON analytics_events(anonymous,at);

CREATE TABLE IF NOT EXISTS analytics_revocations (anonymous TEXT PRIMARY KEY, expires INTEGER NOT NULL);
