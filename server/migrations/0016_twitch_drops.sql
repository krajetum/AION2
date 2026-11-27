-- Twitch Drops campaigns players share (Home > Twitch Drops). `key` = the title lowercased, spaces collapsed (one campaign per title).
-- A campaign is listed until it ends (ends_ms); DROP_EXPIRED_VOTES installs saying it's wrong or over remove it at once (dead_ms).
-- Ended or removed campaigns stay REDEEM_KEEP so the same one can't be shared again meanwhile; the daily cron drops them after.
CREATE TABLE twitch_drops (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  rewards TEXT NOT NULL,
  url TEXT,
  install TEXT NOT NULL,
  added_ms INTEGER NOT NULL,
  starts_ms INTEGER,
  ends_ms INTEGER NOT NULL,
  dead_ms INTEGER
);
CREATE INDEX twitch_drops_ends ON twitch_drops (ends_ms);
CREATE TABLE twitch_drop_votes (
  key TEXT NOT NULL,
  install TEXT NOT NULL,
  PRIMARY KEY (key, install)
);
