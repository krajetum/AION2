# AION 2 Companion

Copyright (C) 2026 Leonardo Pannocchia and Lorenzo Licalzi

This program is free software: you can redistribute it and/or modify it under the terms of
the GNU General Public License version 3 as published by the Free Software Foundation.
It is distributed WITHOUT ANY WARRANTY; see `LICENSE` for the full text.

## Third-party code

- **DPS meter core** (`src-tauri/meter/`): from A2Tools DPS Meter by taengu,
  https://github.com/taengu/a2tools-dps-meter, GPL-3.0. Origin and changes: `src-tauri/meter/NOTICE.md`.

- **Server names** (`src/domain/servers.ts`): the English names from A2Tools DPS Meter's `src/data/servers.json` (GPL-3.0).

- **Class emblems** (`src/ui/classes/*.png`): from A2Tools DPS Meter (`public/assets/`, GPL-3.0 repository),
  renamed to the English class names. The art itself is the game's (NCSOFT).

## Data from other sources

- **Pet names** (`src/domain/pet-names.ts`): pet number → name for 227 pets, from the gamers4.life AION 2 database
  (https://gamers4.life/aion-2/database/en/pet/), saved 2026-10-26. The names are the game's (NCSOFT).
- **Pet soul point spots** (`src/assets/pet-drops.json`): 2,849 drops recorded with this app by its players and
  shared on 2026-10-26, with the players' names taken out. Merged once into every save (`takeBundledDrops`).

## NCSOFT material, not under GPL-3.0

- **World map** (`src/assets/ncsoft/world-map.webp`): stitched from AION 2 screenshots, © NCSOFT.
  Excluded from this project's GPL-3.0 license; included as the Map page's default map and removed at
  NCSOFT's request. See `src/assets/ncsoft/README.md`.

## Not affiliated with NCSOFT

AION is a trademark of NCSOFT Corporation. This is an unofficial fan project. The DPS meter reads a
copy of the game's network traffic; using third-party tools may be against the game's terms of service.
