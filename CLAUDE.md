# AION 2 Companion

Windows desktop tracker for recurring AION 2 (EU server) tasks, replacing a Google Sheet, plus a passive DPS meter.
Tauri 2 + TypeScript + Svelte 5 + Vite. Single user, multiple characters, everything local. License: GPL-3.0 (`LICENSE`, `NOTICE.md`).

## Commands
- `npm test` — domain + server tests, `src/**/*.test.ts` and `server/**/*.test.ts` (`node --test`, Node 24 runs `.ts` natively, no test deps)
- `npx tsc --noEmit` — type-check `.ts`; `npm run check` — svelte-check (also covers `.svelte` files)
- `cargo test -p aion2-meter` (in `src-tauri/`) — DPS meter parser tests (A2Tools' own, with byte samples from live captures)
- `cargo run -p aion2-meter --example smoke` — starts the live capture and prints updates (Linux needs libpcap)
- `cargo run -p aion2-meter --example replay -- <recording.txt>` — feeds a packet recording (Settings > Diagnostics) through the meter offline (`Engine::offline`) and prints the arena match, kills and deaths as the app would have logged them
- `npm run tauri dev` — real desktop app (needs Rust + MSVC; first build ~2 min)
- CI: one workflow, `.github/workflows/release.yml`, on every merge into `main` (except `.md`-only changes); nothing runs on branches or PRs,
  so run `npm test` / `npm run check` locally before merging. Jobs: `check` (ubuntu: npm test, tsc for app and `server/`, svelte-check, then what changed) →
  `server` (only if `server/` changed: D1 migrations + deploy of the Cloudflare Worker, no version bump) and
  `release` (only if anything outside `server/` changed: `cargo test -p aion2-meter`, then bumps the patch version, commits and tags it on `main`,
  builds, signs and publishes a GitHub Release + `latest.json`, the updater endpoint). Minor/major: "Run workflow" in Actions (runs both).
  Don't bump the version by hand; pull after a merge. Version lives only in `package.json`.
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
  - `crowd.ts` — crowdsourcing (the `server/` Worker): which boss maps / cube openings to share, the Worker's answers onto the local clock
  - `meter.ts` — DPS meter update types (as the Rust engine sends them: fight, boss timers, Odyle energy, profile, last arena match), views (damage/healing/taken), number/HP formatting
  - `servers.ts` — server names by id (A2Tools' table), faction/region from the id, `gearUrl` (a player's profile on shugo.gg)
  - `pets.ts` — your pet collection per character (`AppData.pets`, sent on entering the world: login or character select), soul points gained since
    (`addSoulPoints`: unlock at 5, level 2 at 25, level 3 at 75 more, the last; no guessing a pet done from crystals: a crystal is not its mob's pet's, and that guess put level 2 pets at 3; `finishFromSilentKills`: a level 2 pet at most 3 points short whose mob (`map.ts` `mobKind`: ≥3 recorded kills, all one pet) gave no points on 2 of your kills is done, its last points lost), `petName` (the player's, else `pet-names.ts` = gamers4.life's 227 names, else the mob's, else "Pet #id"), `wanted`
  - `wallet.ts` — currencies per character (`AppData.wallets`: Kina 930100031, bound Kina 930100001, Abyss Points 930100003, Nightmare Coins 930100017, Shugo Coins 930100011, item codes checked against the game's amounts 2026-10-27; Kuna's code not known yet) + Odyle energy, shown in the sidebar's Wallet (`pickWallet`: the selected character's by name, else the one played in game, else the only one kept; `walletRows`; tick `settings.sumKina` = Kina and bound Kina as one total)
  - `wiki.ts` — Wiki pages' data (Expeditions: Exploration/Conquest/Hard, Transcendence stages, `MECHANICS` = shared rules): pure constants from online guides,
    `Val` = a value, or `{ v, note }` when unconfirmed (one source, or sources disagree); `VERIFIED` date, sources per dungeon; `seasonMissions` reads `season.ts`. Update by hand after a patch
  - `bosses.ts` — field-boss respawn timers from the maps opened in game, `bossLabel` (bosses the game data doesn't name: `KNOWN_BOSS_NAMES` for the Abyss ones the player identified, else the player names them, `AppData.bossNames`); `arena.ts` — arena matchup log (`logMatch`; `mergeRound`: an arena reloads its map between rounds, so a round on the same map within 2 min against an opponent of the last match is added to it, players by name), kill history (`logKills`), map names (`mapLabel`: the player's, `KNOWN_MAPS` 20 = Abyss, else "Map id")
  - `map.ts` — Map page: three maps (`MAPS`: Asmodian = bundled world map, `BUNDLED_FIT`, map id `WORLD_MAP_ID`; Elyos (Verteron) = bundled screenshot, map
    id 1010, `ELYOS_FIT` from a recorded walk; an id no map claims, or an unknown map (null), is on none (`onMap`); Abyss = bundled screenshot, map id 20, `ABYSS_FIT` from 3 recorded spots), points per map, clusters,
    pan/zoom math, game→pixel affine fit (the player's references per map override the bundled one); pets' soul point drops (`PetDrop`:
    from the meter's soul kills (`takeSouls`, one per mob and spot; a mob not seen spawning named by its soul kind, `kinds`; a kill while the meter has no map id (app started in game) on the one map its mob's spots are on, `mapOfMob`, else it waits; points of another pet than the mob always gives, `mobKind`, are paired with the wrong kill: no spot) and your loots of an item the player named as a pet's crystal
    (`takeLoots`, `items`: a finished collection drops a crystal instead of soul points), "Soul points here" or a click; `souls` = mob → soul as the player
    named it (`soulOf`), shared as a `dropsFile` with the names and merged by id or same time+spot+mob (adds only, names already set stay); `src/assets/pet-drops.json` = the players' shared drops without their names, merged once per `BUNDLED_DROPS` date (`takeBundledDrops`, fetched in `main.ts`), `petList` search by soul or mob, `petHome`; `linkKinds`: kills recorded with no pet number get their mob's, the player's pick `mobPets` (drop panel) else the kind its other kills carried most, `linked`; never for crystals); cubes found and
    cube codes learned (`takeCubes`, `KNOWN_CUBE_CODES`), `bearing` / `climb` for the cube popup, `onRadar` for the radar
- `src/app/` — use cases that change `AppData` (progress, tasks, characters, season, settings, planner session, `checkNotifications`, `arena.ts`: meter data into the save file, `crowd.ts`: share/download boss timers and cube spots, boss reads every 2 min only while playing)
- `src/infra/` — Tauri adapters: `storage.ts` (plugin-store `data.json`, export/import), `notifier.ts` (toasts, sounds), `steam.ts` (news fetch), `map-image.ts` (images the player picks, in IndexedDB, never in the save file, export or repo: an imported image per map, else the bundled one in `src/assets/ncsoft/` (`ui/maps.ts`), © NCSOFT, outside the GPL; the cube popup's "opened by you / by others" pictures), `system.ts` (autostart, updater, `tray-mute` event), `meter.ts` (DPS engine commands + `meter-update` / `meter-overlay` events, browser demo), `crowd.ts` (calls the Worker at `CROWD_URL` in `config.ts`, `VITE_CROWD_URL` overrides it)
- `src/ui/` — Svelte UI: `App.svelte` (header, timers, sidebar), `pages/*` (`Dps.svelte` = DPS meter, `Arena.svelte` = arena log + kill history, `parts/PlayerCard.svelte` = a player's server, gear, shugo.gg link, `Map.svelte` = map with a corner menu: map, Cubes / Pets, soul search, each mob's soul, drops, only pets still to collect; `Pets.svelte` = your collection, progress, rename, spots on the map; `WikiDungeons.svelte` = Expeditions / Transcendence pages: dungeon picker, header cards, modes, drops, bosses, sources; `WikiMechanics.svelte` = Dungeon Rules), `parts/*`, `Overlay.svelte` (DPS overlay window), `EventsOverlay.svelte` (event countdown window + next field-boss respawn, all bosses due that minute), `CubeOverlay.svelte` (popup while a hidden cube is in view: distance, compass direction, up/down (`climb`), chime; 5 s "opened" state or picture, sad sound when another player opens it; size from Settings, top centre at first), `RadarOverlay.svelte` (cubes around you, north up, to lay over the game's minimap); `state.svelte.ts` (`ui.data` = reactive save file), `actions.ts` (save after each change, one save at a time: changes during one are saved once after it; undo, news refresh)
- `src/main.ts` — startup: load, resets, mount, meter capture (from app start; only the latest `meter-update` is taken, each carries the meter's whole state, so a slow page never falls behind), 1 s clock; `index.html#overlay` / `#events` / `#cube` / `#radar` mount only that overlay's component
- `server/` — Cloudflare Worker + D1, deployed by the `server` job; optional: the app works without it
- `src-tauri/src/lib.rs` — plugins, tray menu (emits `tray-mute`), close → hide to tray; `links.rs` (`open_url`: web links in the player's browser, the webview opens nothing for `target="_blank"`; `infra/system.ts` `openLinksInBrowser` catches every http(s) link click; no shell, plain URLs only); `crash.rs` (panic hook → `crash.log` in the
  app's log folder, `crash_log` command); `places.rs` (overlay windows reopen where the player left them, `overlay-positions.json`)
- `src-tauri/src/meter.rs` — DPS meter commands (`meter_*`; `meter_start` is async and starts the engine on a blocking thread:
  a synchronous command runs on the UI thread, and Npcap's device list can hang there), `meter-update` events every 200 ms, idle reset
  (`settings.dpsIdleSeconds`), overlay windows (DPS: shown on activity / hidden when idle; events), both hidden while
  another window than the game is in front and transparent (`settings.overlayFollowGame`, `overlayOpacity`); also the cube popup
  and the radar. Never call Win32 window functions while holding `auto`: commands lock it on the UI thread (app hang, 2026-10-24)
- `src-tauri/meter/` — crate `aion2-meter`: capture + parser + aggregation vendored from A2Tools DPS Meter (GPL-3.0).
  Keep A2Tools' files as close to upstream as possible and list every change in `src-tauri/meter/NOTICE.md`;
  companion code goes in `engine.rs` / `snapshot.rs` / `arena.rs` / `recorder.rs` (Settings > Diagnostics: every frame the meter reads,
  plus the player's marks, to a text file in Downloads, for finding new records such as hidden cubes) / `position.rs` (your position:
  map loads, teleports, your own buffs; the map id from map loads, or from the field-boss map `01 91` while none was seen) / `cubes.rs` (hidden cubes: object codes learned from openings, cubes in view,
  openings placed by their loot) / `souls.rs` (your mob kills that gave soul points, and your loots with their item code: loot owner `04 8d`,
  loot place and item `1e 56`, points `0d 90`, every one also kept as a gain for the collection; the engine adds the mob's name) / `pets.rs` (your pet collection, `00 90` on entering the world (not on opening the Pets menu: in two recordings it came 4-6 s after the first map load and never again): owned pets with level, soul points; the pet number is the soul points' kind) / `currencies.rs` (your currencies as inventory items: whole inventory `11 56` on entering the world, before the self record `33 36`, so it goes on the next self record's character; changed items `1b 56`, 40 bytes each; each item `<slot u32> 00 <place u16> 00 <code u32> <amount u64>`: the place's high byte is not 0 past 255) / `abyss_bosses.rs` (the Abyss's world bosses: on them, as on field bosses, the
  server sends no one else's direct hits, so rows are you, your party and Others from the HP lost) / `roster.rs` (the arena's line-up `19 e3`, a few seconds after entering: every player with server (the second of the two server fields: Jedaq (SIE) 1301 on screen, 1321 in the first), level, team and RP; the server is the only one the game sends for opponents; `arena.rs` takes sides, servers and levels from it, and "you" by name too; outside arenas, other players' servers from their spawn records `45 36`, `spawn_server`: in the Abyss Baba or Kochi, the server pair) / `kills.rs` (your PvP kills, assists and deaths: the last hit before a death, your hit within 15 s for an assist, from the PvP ledger) / `tap.rs` (all three on A2Tools' one-slot frame tap; `tap::embedded` = frames of bundles inside other packets: pet collection + recorder `E` lines) / `capture/tcp_order.rs` (the game's TCP segments back in sequence order before the parser: retransmissions and out-of-order segments can desync the stream: junk frames on entering the world in the 2026-10-26 21:15 recording; the recorder marks port changes, lost packets and skipped gaps). Game patches renumber opcodes: update from A2Tools first.

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
