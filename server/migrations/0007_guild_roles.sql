-- Guild roles: Leader > Officer > Member per member, and per guild the lowest role that has each permission
-- (perms = JSON of overrides over validate.ts DEFAULT_PERMS). The leader key (the old "officer key") still counts as Leader.
ALTER TABLE guild_members ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
ALTER TABLE guilds ADD COLUMN perms TEXT NOT NULL DEFAULT '{}';
-- The creator (the first member) of each existing guild leads it; other key holders become Leaders when their app claims.
UPDATE guild_members SET role = 'leader'
  WHERE (guild_id, joined_ms) IN (SELECT guild_id, MIN(joined_ms) FROM guild_members GROUP BY guild_id);
