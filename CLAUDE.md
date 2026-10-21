# AION 2 Companion

Windows desktop tracker for recurring AION 2 (EU server) tasks, replacing a Google Sheet.
Tauri 2 + TypeScript + Svelte 5 + Vite. Single user, multiple characters, everything local.

## Commands
- `npm test` — domain tests, `src/**/*.test.ts` (`node --test`, Node 24 runs `.ts` natively, no test deps)
- `npx tsc --noEmit` — type-check `.ts`; `npm run check` — svelte-check (also covers `.svelte` files)
- `npm run tauri dev` — real desktop app (needs Rust + MSVC; first build ~2 min)
- Release: `npm version x.y.z` then `git push --follow-tags` → `.github/workflows/release.yml` builds, signs and publishes a GitHub Release + `latest.json` (the updater endpoint). Version lives only in `package.json`.
- `npm run dev` — UI only in a browser on http://localhost:1420 (launch config `web-ui` in `.claude/launch.json`)

## Verifying changes
- Logic → `npm test`. UI → `preview_start` with `web-ui` and check it in the browser pane:
  outside Tauri, `infra/storage.ts` uses localStorage (key `aion2-companion-data`) and `toast()` logs to the console,
  so autostart, tray and real toasts can only be checked in `npm run tauri dev`.
- Rust changes → `cargo build` in `src-tauri/`.

## Layout
Layers, dependencies pointing inward: `domain` ← `app` ← `ui` / `infra`; `main.ts` wires them.
- `src/config.ts` — the ONLY place for server reset times; every value is a placeholder marked `TO VERIFY`
- `src/domain/` — pure rules, no DOM/Tauri/Svelte, tested with `npm test`
  - `types.ts` — data model (`AppData` = save file = export format); `seed.ts` — initial tasks from the Sheet
  - `time.ts` — time-zone math (Intl only), last/next boundary, event times; `resets.ts` — `applyResets` (`reset.test.ts`: app closed across resets, DST, month ends)
  - `tasks.ts` — `isDone`, goal text format; `alerts.ts` — notification channels, volume, quiet hours, event lead times
  - `planner.ts` — knapsack over unfinished tasks for an N-minute session, events pinned, estimates learned from tick timings
  - `season.ts` — Season Oath Coin missions (fixed data from the coin sheet) + Summary math; `SEASON` end date lives in `config.ts`
  - `undo.ts` — saved undo history for progress (ticks, counters, Reset button); `applyResets` prunes it
  - `news.ts` — Steam feed parsing + read/unread cache; `save-file.ts` — default data + migration of old/imported saves
- `src/app/` — use cases that change `AppData` (progress, tasks, characters, season, settings, planner session, `checkNotifications`)
- `src/infra/` — Tauri adapters: `storage.ts` (plugin-store `data.json`, export/import), `notifier.ts` (toasts, sounds), `steam.ts` (news fetch), `system.ts` (autostart, updater, `tray-mute` event)
- `src/ui/` — Svelte UI: `App.svelte` (header, timers, sidebar), `pages/*`, `parts/*`; `state.svelte.ts` (`ui.data` = reactive save file), `actions.ts` (save after each change, undo, news refresh)
- `src/main.ts` — startup: load, resets, mount, 1 s clock
- `src-tauri/src/lib.rs` — plugins, tray menu (emits `tray-mute`), close → hide to tray

## Rules
- Never read game memory, inject code, simulate input or automate the game (ToS/anti-cheat). Manual tracker + notifications only.
- Never invent server/event times: they go in `src/config.ts` marked `TO VERIFY`.
- Resets are computed from timestamps (`lastReset` vs `lastBoundary`), never from timers, so they work after the app was closed.
- Allowed deps: Tauri plugins notification, store, autostart, http, updater (tray is core); Svelte 5 (+ vite-plugin-svelte, svelte-check). Ask before adding any other dependency.
- Ask before deleting files, running commands outside this folder, `git init`, or publishing anything.
- UI, notifications and code comments are in English.
- Ignore `spikes/` and `~/` — unrelated to the app.

## Phase 2 (not built yet)
Compact always-on-top overlay + global hotkey · calendar event timers (Siege, Boss Invasion) ·
weekly completion history per character · daily Kina tracker vs 1M cap · CSV import from the Sheet.
