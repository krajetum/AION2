-- Field-boss timers: one row per map = the latest reading (timers = JSON BossTimer[], server clock).
CREATE TABLE boss_maps (
  server_id INTEGER NOT NULL,
  map_id INTEGER NOT NULL,
  seen_ms INTEGER NOT NULL,
  timers TEXT NOT NULL,
  install TEXT NOT NULL,
  PRIMARY KEY (server_id, map_id)
);

-- Hidden-cube openings: one install counts once per cell (300 game units); published at >= 3 installs.
CREATE TABLE cube_reports (
  map_id INTEGER NOT NULL,
  cell TEXT NOT NULL,
  install TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  z REAL NOT NULL,
  code INTEGER,
  at_ms INTEGER NOT NULL,
  PRIMARY KEY (map_id, cell, install)
);

-- Object codes learned to be cubes; published at >= 2 installs.
CREATE TABLE cube_codes (
  code INTEGER NOT NULL,
  install TEXT NOT NULL,
  PRIMARY KEY (code, install)
);

-- Rate limit: POSTs per install per hour (hour = epoch ms / 3600000).
CREATE TABLE writes (
  install TEXT NOT NULL,
  hour INTEGER NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (install, hour)
);
