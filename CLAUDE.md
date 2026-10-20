# AION 2 Companion

Windows desktop tracker for recurring AION 2 (EU server) tasks, replacing a Google Sheet.
Tauri 2 + vanilla TypeScript + Vite. Single user, multiple characters, everything local.

## Commands
- `npm test` — reset/countdown tests (`node --test`, Node 24 runs `.ts` natively, no test deps)
- `npx tsc --noEmit` — type-check
- `npm run tauri dev` — real desktop app (needs Rust + MSVC; first build ~2 min)
- Release: `npm version x.y.z` then `git push --follow-tags` → `.github/workflows/release.yml` builds, signs and publishes a GitHub Release + `latest.json` (the updater endpoint). Version lives only in `package.json`.
- `npm run dev` — UI only in a browser on http://localhost:1420 (launch config `web-ui` in `.claude/launch.json`)

## Verifying changes
- Logic → `npm test`. UI → `preview_start` with `web-ui` and check it in the browser pane:
  outside Tauri, `data.ts` uses localStorage (key `aion2-companion-data`) and `toast()` logs to the console,
  so autostart, tray and real toasts can only be checked in `npm run tauri dev`.
- Rust changes → `cargo build` in `src-tauri/`.

## Layout
- `src/config.ts` — the ONLY place for server reset times; every value is a placeholder marked `TO VERIFY`
- `src/reset.ts` — pure functions: time-zone math (Intl only), last/next boundary, `applyResets`, `isDone`
- `src/reset.test.ts` — tests: app closed across resets, DST in March/October, month ends
- `src/season.ts` — Season Oath Coin missions (fixed data from the coin sheet) + Summary math; `SEASON` end date lives in `config.ts`
- `src/seed.ts` — initial tasks from the Sheet; `src/types.ts` — data model (`AppData` = save file = export format)
- `src/data.ts` — load/save (plugin-store `data.json`) + JSON export/import
- `src/notify.ts` — Cloud Merchant reminder, pre-reset warnings, quiet hours
- `src/main.ts` — whole UI (string templates + event delegation via `data-act`)
- `src-tauri/src/lib.rs` — plugins, tray menu (emits `tray-mute`), close → hide to tray

## Rules
- Never read game memory, inject code, simulate input or automate the game (ToS/anti-cheat). Manual tracker + notifications only.
- Never invent server/event times: they go in `src/config.ts` marked `TO VERIFY`.
- Resets are computed from timestamps (`lastReset` vs `lastBoundary`), never from timers, so they work after the app was closed.
- Allowed deps: Tauri plugins notification, store, autostart, http, updater (tray is core). Ask before adding any other dependency.
- Ask before deleting files, running commands outside this folder, `git init`, or publishing anything.
- UI, notifications and code comments are in English.
- Ignore `spikes/` and `~/` — unrelated to the app.

## Phase 2 (not built yet)
Compact always-on-top overlay + global hotkey · calendar event timers (Siege, Boss Invasion) ·
weekly completion history per character · daily Kina tracker vs 1M cap · CSV import from the Sheet.
