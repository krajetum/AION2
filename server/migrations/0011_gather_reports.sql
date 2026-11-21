-- Gathering spots: one install counts once per material and cell (500 game units); published at >= 2 installs.
CREATE TABLE gather_reports (
  map_id INTEGER NOT NULL,
  item INTEGER NOT NULL,
  cell TEXT NOT NULL,
  install TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  z REAL NOT NULL,
  at_ms INTEGER NOT NULL,
  PRIMARY KEY (map_id, item, cell, install)
);
CREATE INDEX gather_reports_at ON gather_reports (at_ms);
