-- Raid plan: each member's free hours in a week (Monday 00:00 to Sunday 24:00, server time, one bit per hour:
-- 168 bits as 42 hex digits, the app's domain/raidplan.ts). slots = every week; weeks = JSON {"YYYY-MM-DD" (that week's
-- Monday): slots} for weeks that differ ("only this week"), pruned once past. One row per member; it goes when they leave.
CREATE TABLE guild_availability (
  guild_id TEXT NOT NULL,
  install TEXT NOT NULL,
  slots TEXT NOT NULL,
  weeks TEXT NOT NULL DEFAULT '{}',
  updated_ms INTEGER NOT NULL,
  PRIMARY KEY (guild_id, install)
);
