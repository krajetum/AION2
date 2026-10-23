# AION 2 Companion

Windows desktop tracker for recurring AION 2 (EU server) tasks, replacing a Google Sheet, plus a passive DPS meter.
Tauri 2 + TypeScript + Svelte 5 + Vite. Single user, multiple characters, everything local. License: GPL-3.0 (`LICENSE`, `NOTICE.md`).

## Commands
- `npm test` — domain tests, `src/**/*.test.ts` (`node --test`, Node 24 runs `.ts` natively, no test deps)
- `npx tsc --noEmit` — type-check `.ts`; `npm run check` — svelte-check (also covers `.svelte` files)
- `cargo test -p aion2-meter` (in `src-tauri/`) — DPS meter parser tests (A2Tools' own, with byte samples from live captures)
- `cargo run -p aion2-meter --example smoke` — starts the live capture and prints updates (Linux needs libpcap)
- `npm run tauri dev` — real desktop app (needs Rust + MSVC; first build ~2 min)
- Release: automatic. Every merge into `main` (except `.md`-only changes) → `.github/workflows/release.yml` bumps the patch version, commits and tags it on `main`, builds, signs and publishes a GitHub Release + `latest.json` (the updater endpoint). Minor/major: "Run workflow" in Actions. Don't bump the version by hand; pull after a merge. Version lives only in `package.json`.
- `npm run dev` — UI only in a browser on http://localhost:1420 (launch config `web-ui` in `.claude/launch.json`)

## Verifying changes
- Logic → `npm test`. UI → `preview_start` with `web-ui` and check it in the browser pane:
  outside Tauri, `infra/storage.ts` uses localStorage (key `aion2-companion-data`) and `toast()` logs to the console,
  so autostart, tray and real toasts can only be checked in `npm run tauri dev`.
  The DPS page shows a labelled demo fight outside Tauri (`infra/meter.ts`); real numbers only in the desktop app with Npcap and the game.
- Rust changes → `cargo build` in `src-tauri/`.

## Layout
Layers, dependencies pointing inward: `domain` ← `app` ← `ui` / `infra`; `main.ts` wires them.
- `src/config.ts` — the ONLY place for server reset times; every value is a placeholder marked `TO VERIFY`
- `src/domain/` — pure rules, no DOM/Tauri/Svelte, tested with `npm test`
  - `types.ts` — data model (`AppData` = save file = export format); `seed.ts` — initial tasks from the Sheet
  - `time.ts` — time-zone math (Intl only), last/next boundary, event times; `resets.ts` — `applyResets` (`reset.test.ts`: app closed across resets, DST, month ends)
  - `tasks.ts` — `isDone`, goal text format; `alerts.ts` — notification channels, volume, quiet hours, event lead times
  - `planner.ts` — knapsack over unfinished tasks for an N-minute session, events pinned, estimates learned from tick timings
  - `season.ts` — Season Oath Coin missions (fixed data from the coin sheet) + Summary math; steps ticked per mission
    (seasonal, and weekly per weekly reset) → claimed / still to claim this week (≈ for partial steps: only mission totals are known); `SEASON` end date lives in `config.ts`
  - `undo.ts` — saved undo history for progress (ticks, counters, Reset button); `applyResets` prunes it
  - `news.ts` — Steam feed parsing + read/unread cache; `save-file.ts` — default data + migration of old/imported saves
  - `meter.ts` — DPS meter update types (as the Rust engine sends them: fight, boss timers, Odyle energy, profile, last arena match), views (damage/healing/taken), number/HP formatting
  - `bosses.ts` — field-boss respawn timers from the maps opened in game; `arena.ts` — arena matchup log
  - `map.ts` — Map page: cube spots / references on the player's own map image, clusters, pan/zoom math, game→pixel affine fit
    (`BUNDLED_FIT` for the bundled world map, map id `WORLD_MAP_ID`; the player's references override it); cubes found and
    cube codes learned (`takeCubes`, `KNOWN_CUBE_CODES`), `bearing` for the cube popup
- `src/app/` — use cases that change `AppData` (progress, tasks, characters, season, settings, planner session, `checkNotifications`, `arena.ts`: meter data into the save file)
- `src/infra/` — Tauri adapters: `storage.ts` (plugin-store `data.json`, export/import), `notifier.ts` (toasts, sounds), `steam.ts` (news fetch), `map-image.ts` (an imported map image in IndexedDB, never in the save file or export; else the bundled `src/assets/ncsoft/world-map.webp`, © NCSOFT, outside the GPL), `system.ts` (autostart, updater, `tray-mute` event), `meter.ts` (DPS engine commands + `meter-update` / `meter-overlay` events, browser demo)
- `src/ui/` — Svelte UI: `App.svelte` (header, timers, sidebar), `pages/*` (`Dps.svelte` = DPS meter, `Arena.svelte` = arena log, `Map.svelte` = map with cube spots), `parts/*`, `Overlay.svelte` (DPS overlay window), `EventsOverlay.svelte` (event countdown window + next field-boss respawn, all bosses due that minute), `CubeOverlay.svelte` (popup while a hidden cube is in view: distance, compass direction); `state.svelte.ts` (`ui.data` = reactive save file), `actions.ts` (save after each change, undo, news refresh)
- `src/main.ts` — startup: load, resets, mount, meter capture (from app start), 1 s clock; `index.html#overlay` / `#events` / `#cube` mount only `Overlay.svelte` / `EventsOverlay.svelte` / `CubeOverlay.svelte`
- `src-tauri/src/lib.rs` — plugins, tray menu (emits `tray-mute`), close → hide to tray
- `src-tauri/src/meter.rs` — DPS meter commands (`meter_*`), `meter-update` events every 200 ms, idle reset
  (`settings.dpsIdleSeconds`), overlay windows (DPS: shown on activity / hidden when idle; events), both hidden while
  another window than the game is in front and transparent (`settings.overlayFollowGame`, `overlayOpacity`)
- `src-tauri/meter/` — crate `aion2-meter`: capture + parser + aggregation vendored from A2Tools DPS Meter (GPL-3.0).
  Keep A2Tools' files as close to upstream as possible and list every change in `src-tauri/meter/NOTICE.md`;
  companion code goes in `engine.rs` / `snapshot.rs` / `arena.rs` / `recorder.rs` (Settings > Diagnostics: every frame the meter reads,
  plus the player's marks, to a text file in Downloads, for finding new records such as hidden cubes) / `position.rs` (your position:
  map loads, teleports, your own buffs) / `cubes.rs` (hidden cubes: object codes learned from openings, cubes in view,
  openings placed by their loot) / `tap.rs` (all three on A2Tools' one-slot frame tap). Game patches renumber opcodes: update from A2Tools first.

## Rules
- Never read game memory, inject code, simulate input or automate the game (ToS/anti-cheat). Tracker + notifications,
  plus the DPS meter, which may only *passively read a copy of network traffic* (Npcap/libpcap). Never decrypt traffic,
  never send packets, never hook rendering (overlay = normal always-on-top window).
- Never invent server/event times: they go in `src/config.ts` marked `TO VERIFY`.
- Resets are computed from timestamps (`lastReset` vs `lastBoundary`), never from timers, so they work after the app was closed.
- Allowed deps: Tauri plugins notification, store, autostart, http, updater (tray is core); Svelte 5 (+ vite-plugin-svelte, svelte-check);
  for `src-tauri/meter`: serde, serde_json, lz4_flex, parking_lot, tracing, libloading, tokio, windows. Ask before adding any other dependency.
- Ask before deleting files, running commands outside this folder, `git init`, or publishing anything.
- UI, notifications and code comments are in English.
- Ignore `spikes/` and `~/` — unrelated to the app.

## Phase 2 (not built yet)
Global hotkeys (the DPS overlay exists, without hotkeys) · calendar event timers (Siege, Boss Invasion) ·
weekly completion history per character · daily Kina tracker vs 1M cap · CSV import from the Sheet.
