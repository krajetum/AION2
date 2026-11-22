-- Pets' soul point spots (a mob kill that gave soul points): one install counts once per pet (the soul points' kind)
-- and cell (500 game units); published from one install, like gathering spots.
CREATE TABLE soul_reports (
  map_id INTEGER NOT NULL,
  kind INTEGER NOT NULL,
  cell TEXT NOT NULL,
  install TEXT NOT NULL,
  mob TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  z REAL NOT NULL,
  at_ms INTEGER NOT NULL,
  PRIMARY KEY (map_id, kind, cell, install)
);
CREATE INDEX soul_reports_at ON soul_reports (at_ms);
