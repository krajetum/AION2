-- Field-boss alerts to Discord become an officer's switch (off for new guilds): the webhook also carries call-ups,
-- which a guild may want without boss alerts. Guilds with a webhook already got boss alerts: they keep them.
ALTER TABLE guilds ADD COLUMN boss_alerts INTEGER NOT NULL DEFAULT 0;
UPDATE guilds SET boss_alerts = 1 WHERE webhook IS NOT NULL;
DROP INDEX IF EXISTS guilds_alerting;
CREATE INDEX guilds_alerting ON guilds (server_id) WHERE webhook IS NOT NULL AND boss_alerts = 1;
