-- Call-ups: an officer's planned raid (at_ms), reminded at chosen times before it (leads = JSON minutes before).
-- next_ms = the next reminder still to post to the guild's Discord, null once all were posted: the cron reads it by index.
CREATE TABLE guild_callups (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  at_ms INTEGER NOT NULL,
  message TEXT NOT NULL,
  ping TEXT NOT NULL,
  leads TEXT NOT NULL,
  next_ms INTEGER,
  created_ms INTEGER NOT NULL
);
CREATE INDEX guild_callups_next ON guild_callups (next_ms);
CREATE INDEX guild_callups_guild ON guild_callups (guild_id, at_ms);
