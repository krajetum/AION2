-- Guilds: a member code to join, an officer key for the officer actions. Only their SHA-256 (hex) is kept.
-- webhook = the officer's Discord webhook for boss alerts (never sent back to the apps), lead_min = minutes before a respawn.
CREATE TABLE guilds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  server_id INTEGER NOT NULL,
  member_hash TEXT NOT NULL,
  officer_hash TEXT NOT NULL,
  webhook TEXT,
  lead_min INTEGER NOT NULL DEFAULT 5,
  created_ms INTEGER NOT NULL
);
CREATE INDEX guilds_member ON guilds (member_hash);
CREATE INDEX guilds_alerting ON guilds (server_id) WHERE webhook IS NOT NULL;

-- One row per install in a guild: its character as its meter last saw it, and what it agreed to share.
CREATE TABLE guild_members (
  guild_id TEXT NOT NULL,
  install TEXT NOT NULL,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  item_level INTEGER,
  combat_power INTEGER,
  share_gear INTEGER NOT NULL,
  share_fights INTEGER NOT NULL,
  joined_ms INTEGER NOT NULL,
  seen_ms INTEGER NOT NULL,
  PRIMARY KEY (guild_id, install)
);

-- Boss fights members shared (record = the app's FightRecord, trimmed, JSON); shown only while the member shares fights.
CREATE TABLE guild_fights (
  guild_id TEXT NOT NULL,
  id TEXT NOT NULL,
  install TEXT NOT NULL,
  boss TEXT NOT NULL,
  end_ms INTEGER NOT NULL,
  battle_ms INTEGER NOT NULL,
  killed INTEGER NOT NULL,
  record TEXT NOT NULL,
  PRIMARY KEY (guild_id, id)
);
CREATE INDEX guild_fights_boss ON guild_fights (guild_id, boss, end_ms);

-- Discord alerts posted (alert_key = mapId:bossId), so each respawn is posted once.
CREATE TABLE guild_posts (
  guild_id TEXT NOT NULL,
  alert_key TEXT NOT NULL,
  at_ms INTEGER NOT NULL,
  PRIMARY KEY (guild_id, alert_key)
);

-- The earliest respawn still to come on the map: the alert cron reads only maps due soon, through this index.
ALTER TABLE boss_maps ADD COLUMN next_due_ms INTEGER;
CREATE INDEX boss_maps_due ON boss_maps (server_id, next_due_ms);
