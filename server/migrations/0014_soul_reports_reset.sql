-- Soul point spots sent before 2026-11-22's fix: kills with no pet number went as the pet named like their mob, so
-- pets showed other pets' mobs. Cleared: the apps send their spots again with only sure pet numbers (SOULS_REV 2).
DELETE FROM soul_reports;
