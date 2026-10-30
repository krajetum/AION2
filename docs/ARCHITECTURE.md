# Architecture

How AION 2 Companion is put together. For setup and day-to-day work, see [DEVELOPMENT.md](DEVELOPMENT.md).
For the meter crate, see [METER.md](METER.md).

## Overview

```
┌──────────────────────────── Tauri process (Rust, src-tauri/) ────────────────────────────┐
│  lib.rs   plugins, tray menu, close → hide to tray, single instance                       │
│  meter.rs meter_* commands · "meter-update" event every 200 ms · overlay windows           │
│  crash.rs panic → crash.log   places.rs overlay positions   links.rs open URLs in browser  │
│                                                                                            │
│  aion2-meter crate (src-tauri/meter/)                                                      │
│    Npcap capture → TCP reorder → parser → DataStorage → DpsCalculator ─┐                   │
│    companion modules: position, cubes, souls, pets, currencies, kills, │→ engine::Update   │
│    roster, arena, abyss_bosses, recorder                               ┘                   │
└───────────────────────────────────────────┬────────────────────────────────────────────────┘
                                            │ events (meter-update, meter-overlay, tray-mute…)
                                            │ commands (invoke)
┌───────────────────────────── Webview (TypeScript + Svelte, src/) ─────────────────────────┐
│  main.ts      startup, meter subscription, 1 s clock                                       │
│  ui/          App.svelte + pages/* + overlays     ui.data (reactive save file), ui.meter    │
│  app/         use cases that change AppData                                                 │
│  domain/      pure rules (resets, planner, season, map, pets, arena, triggers…)  ← tested  │
│  infra/       storage, notifier, meter, steam, crowd, system, map-image                     │
└───────────────────────────────────────────┬────────────────────────────────────────────────┘
                                            │ HTTPS (optional)
                          Cloudflare Worker + D1 (server/): shared boss timers and cube spots
```

## Layers

`domain` ← `app` ← `ui` / `infra`. Dependencies only point inward, and `main.ts` is the one place that wires
everything together.

| Layer | May import | Contains |
|---|---|---|
| `domain/` | other `domain/` files, `config.ts` | Types, pure functions, constants from game data. No DOM, Tauri or Svelte. |
| `app/` | `domain/` | Functions that take `AppData` and change it (progress, characters, settings, meter intake, crowd sync). |
| `infra/` | `domain/`, Tauri APIs | Persistence, notifications, Tauri commands/events, HTTP. Each has a browser fallback. |
| `ui/` | everything above | Svelte 5 components; reactive state in `state.svelte.ts`. |

Most logic is in `domain/`, so most of it is covered by `npm test` without a browser or Tauri.

## Startup (`src/main.ts`)

`index.html` is loaded by every window. The URL hash decides which window this is:

- no hash → **main window**: `main()`.
- `#overlay` (DPS), `#events` (event countdowns), `#cube` (cube popup), `#radar` → mount only that overlay
  component. Overlays don't load the save file and send no notifications. They listen to the same meter events.

`main()`:
1. `loadData()` reads `data.json` (or `localStorage`), and `normalize()` migrates old saves.
2. Merges the bundled pet drops once per `BUNDLED_DROPS` date.
3. `applyResets()` catches up on every reset missed while the app was closed, then `checkNotifications()`.
4. Loads the Fight Log (`fights.json`), saves, and mounts `App.svelte`.
5. On desktop, opens the overlays the settings ask for and sends the meter its settings (idle reset, cube codes).
6. Subscribes to `meter-update` (below).
7. Checks for an app update, fetches news, and pulls crowd boss timers and cube spots.
8. Starts a 1 s clock: `ui.now` for countdowns; every 15 s resets + notifications; news every 30 min; crowd boss
   timers every 2 min and cube spots every hour, the crowd ones only while the game is running.

## Data and persistence

| What | Where | Notes |
|---|---|---|
| Save file (`AppData`, `domain/types.ts`) | plugin-store `data.json` in `%APPDATA%\it.hobby.aion2companion\` | Also the export/import format. One file, saved whole. |
| Fight Log | `fights.json`, same folder | Kept apart because it grows by hundreds of KB. |
| Map images the player imports | IndexedDB (`infra/map-image.ts`) | Never in the save file, export or repo. |
| Overlay window positions | `overlay-positions.json` (`places.rs`) | |
| Browser mode | `localStorage` keys `aion2-companion-data`, `aion2-companion-fights` | |

Rules for the save file:
- **Migration** happens in one place, `normalize()` in `domain/save-file.ts`. Every field has a fallback, so old saves
  and hand-edited backups load.
- **Saving**: `ui/actions.ts` `save()` runs one save at a time, and changes made during a save are saved once after
  it. UI code calls `act(() => change)`, which applies the change and then saves.
- **Undo**: progress changes push the previous progress onto `AppData.undo` (max 30, newest last). `applyResets`
  prunes entries a reset made meaningless.

## Resets and time

`config.ts` holds the reset schedule (time zone, daily / weekly / monthly) and the recurring events. `domain/time.ts`
does all the time-zone math with `Intl` only.

A reset is never a timer. `applyResets(data, now)` compares `lastReset[cadence]` with the most recent boundary
before `now`, and clears progress if a boundary has passed since. The same code covers a running app, an app closed
for a week, DST changes and month ends (`reset.test.ts`).

## The meter → UI flow

1. The Rust engine keeps the whole meter state. `meter.rs` emits it to every window as `meter-update`, at most every
   200 ms (`engine::Update`: status, current fight, bosses, profile, position, arena, cubes, souls, pets, wallet…).
2. `main.ts` keeps **only the latest** update. Each one carries the full state, so a slow page (the Map with ~1,400
   spots) can skip frames and never falls behind.
3. For each update it takes:
   - `ui.meter = latest`: the DPS page and the overlays render straight from it.
   - **Fight Log**: `fightEnded(last, latest)` → `addFight` → `fights.json`.
   - **Auto-tracked tasks**: `eventsFrom(last, latest)` turns changes into events (map entered, boss killed, arena
     match, PvP kill). `autoTick` ticks the matching tasks of the character the game says you're playing, with a toast
     and Ctrl+Z to undo.
   - **Crowd**: `shareFromMeter` queues boss timers and cube openings to share (if enabled).
   - **Save file**: `takeMeterData` (`app/arena.ts`) merges what lasts (arena matches, kills, boss timers, pets,
     wallets, map drops, cubes, server id), and saves only if something changed.
4. Commands go the other way through `infra/meter.ts` (`meterReset`, `meterPause`, `meterView`, `meterIdle`,
   `meterCubeCodes`, `recorder_*`…).

## Windows

| Window | Component | Shown when |
|---|---|---|
| Main | `App.svelte` | Always. Closing it hides it to the tray. A second launch brings it to the front. |
| DPS overlay | `Overlay.svelte` | `settings.dpsOverlay`: shows on combat, hides when idle |
| Events | `EventsOverlay.svelte` | `settings.eventsOverlay`: event countdowns + next field-boss respawn |
| Cube popup | `CubeOverlay.svelte` | `settings.cubePopup`, while a hidden cube is in view |
| Radar | `RadarOverlay.svelte` | `settings.radar`, to lay over the game's minimap |

The overlays are normal always-on-top transparent windows. With `overlayFollowGame` they hide while another window
than the game is in front. They reopen where the player left them.

## Notifications

`app/notifications.ts` `checkNotifications(data, now, toast)` is pure apart from the `toast` callback. It covers reset
warnings (`warnHours`), event lead times, the Cloud Merchant and field-boss respawns (`bossAlerts`). News toasts come
from `refreshNews` (`ui/actions.ts`), and auto-tick toasts from `main.ts`. It honours
quiet hours, `mutedUntil` (tray "mute for an hour") and per-channel volume (`domain/alerts.ts`). It records what was
already sent (`warned`, `warnedEvent`, `lastCloudHour`) in the save file, so a restart doesn't repeat a toast.

## External services

| Service | Used for | Code |
|---|---|---|
| Steam news feed | News page and news toasts | `infra/steam.ts`, `domain/news.ts` |
| GitHub Releases `latest.json` | App updates (signed) | `infra/system.ts`, Tauri updater |
| Crowd Worker | Shared boss timers and cube spots (optional, opt-in to send) | `infra/crowd.ts`, `app/crowd.ts`, [SERVER.md](SERVER.md) |
| shugo.gg | Links to a player's gear profile | `domain/servers.ts` `gearUrl` |
| NCSOFT CDN | Skill icons | `snapshot.rs::skill_icon` |

Everything works offline. Each of these fails quietly and the app carries on.
