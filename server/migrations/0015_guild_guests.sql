-- Raid plan guests: players who are not in the static (a stand-in while a member is away), added by an officer with
-- their class and free hours (the same 42 hex digits as guild_availability; weeks = weeks that differ). They count in
-- the plan's summary and call-ups; nobody is invited. One row per name; removed by an officer.
CREATE TABLE guild_guests (
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL DEFAULT '',
  slots TEXT NOT NULL,
  weeks TEXT NOT NULL DEFAULT '{}',
  updated_ms INTEGER NOT NULL,
  PRIMARY KEY (guild_id, name)
);
