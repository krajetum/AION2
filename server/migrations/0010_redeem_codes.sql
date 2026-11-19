-- Redeem codes players share (Home > Codes). `key` = the code in capitals (two codes differing only in case are one).
-- A code lasts a week (expires_ms); REDEEM_EXPIRED_VOTES installs marking it expired remove it at once (dead_ms).
-- Ended or removed codes stay REDEEM_KEEP so the same code can't be shared again meanwhile; the daily cron drops them after.
CREATE TABLE redeem_codes (
  key TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  install TEXT NOT NULL,
  added_ms INTEGER NOT NULL,
  expires_ms INTEGER NOT NULL,
  dead_ms INTEGER
);
CREATE INDEX redeem_codes_expires ON redeem_codes (expires_ms);
CREATE TABLE redeem_votes (
  key TEXT NOT NULL,
  install TEXT NOT NULL,
  PRIMARY KEY (key, install)
);
