-- Abyss kills an old app build recorded under the Asmodian map id (one run of 2026-10-26, shared from a player's
-- saved spots): drawn in the sea on the Asmodian map. The area holds no Asmodian spot; the app corrects its copies.
DELETE FROM soul_reports
WHERE map_id = 1110 AND x BETWEEN 35000 AND 75000 AND y BETWEEN 5000 AND 42000
  AND (mob LIKE 'Abyss%' OR mob = 'Old Tree Spirit Warrior');
