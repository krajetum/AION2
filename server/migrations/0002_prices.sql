-- Market prices read by the players' meters: one install = one vote per item, server and day (its latest, lowest
-- price per piece). Published per day as the median of the installs' votes, at >= 2 installs.
CREATE TABLE price_reports (
  server_id INTEGER NOT NULL,
  code INTEGER NOT NULL,
  day INTEGER NOT NULL, -- epoch ms / 86400000
  install TEXT NOT NULL,
  price INTEGER NOT NULL,
  PRIMARY KEY (server_id, code, day, install)
);
