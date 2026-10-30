# Development guide

How to build, test and change AION 2 Companion. For how the pieces fit together, read
[ARCHITECTURE.md](ARCHITECTURE.md). For a file-by-file map, see [CLAUDE.md](../CLAUDE.md).

## Stack

Tauri 2 (Rust shell) + Svelte 5 + TypeScript + Vite. Tests use Node's built-in runner (`node --test`), and Node 24
runs `.ts` natively, so there are no test dependencies. The DPS meter is a Rust crate, `src-tauri/meter`
(`aion2-meter`). The optional crowd server is a Cloudflare Worker with D1, in `server/`.

## Setup

| Need | For |
|---|---|
| Node.js 24+ | everything |
| Rust (stable) + MSVC build tools | the desktop app (`npm run tauri dev`), `cargo test` |
| [Npcap](https://npcap.com/) | live meter capture on Windows (libpcap on Linux) |
| Wrangler (via `npx`) | only to run the Worker locally |

```bash
npm install
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | UI only, in a browser at http://localhost:1420 |
| `npm run tauri dev` | the real desktop app (the first build takes about 2 min) |
| `npm test` | domain + server tests (`src/**/*.test.ts`, `server/**/*.test.ts`) |
| `npx tsc --noEmit` | type-check the app's `.ts` files |
| `npx tsc -p server` | type-check the Worker |
| `npm run check` | svelte-check (`.svelte` files too) |
| `cargo test -p aion2-meter` (in `src-tauri/`) | meter parser tests, with byte samples from live captures |
| `cargo build` (in `src-tauri/`) | check that Rust changes compile |
| `cargo run -p aion2-meter --example smoke` | live capture in a terminal, prints updates |
| `cargo run -p aion2-meter --example replay -- <recording.txt>` | feed a packet recording through the meter offline (see [METER.md](METER.md)) |

## Browser mode vs desktop

`npm run dev` runs the whole UI in a normal browser, which is the fastest loop for UI work. Outside Tauri:

- `infra/storage.ts` saves to `localStorage` (key `aion2-companion-data`), and the Fight Log to `aion2-companion-fights`.
  Clear them to start from a fresh save.
- `toast()` logs to the console instead of showing a Windows notification.
- The DPS page shows a labelled **demo fight** (`infra/meter.ts`).
- Autostart, tray, updater, overlays and real meter numbers exist only in `npm run tauri dev`.

`isDesktop()` / `isTauri()` decide which path runs. Every `infra/` adapter has a browser fallback (or a no-op), so
pages never need to check for Tauri themselves.

To point the browser at a local Worker: `VITE_CROWD_URL=http://localhost:8787 npm run dev` (see [SERVER.md](SERVER.md)).

## Verifying a change

| Changed | Check |
|---|---|
| `src/domain/` logic | `npm test`. Add or extend a `*.test.ts` next to the file. |
| `.svelte` / UI | `npm run check`, then look at it in `npm run dev` |
| tray, toasts, overlays, autostart, meter | `npm run tauri dev` (with the game running for the meter) |
| `src-tauri/` Rust | `cargo build`, plus `cargo test -p aion2-meter` for the meter |
| `server/` | `npm test` + `npx tsc -p server` |

CI runs only after a merge into `main` (see [Releases](#releases)), so run `npm test` and `npm run check` locally
before you merge.

## Code layout and rules

Layers point inward: `domain` ← `app` ← `ui` / `infra`, and `main.ts` wires them together.

- **`src/domain/`** holds pure rules: no DOM, Tauri or Svelte imports. Anything you can test goes here.
- **`src/app/`** holds use cases that change `AppData` (tick progress, add a character, take meter data in).
- **`src/infra/`** holds adapters to Tauri and the outside world (storage, notifications, meter events, HTTP).
- **`src/ui/`** holds Svelte components. Change data through `act()` in `ui/actions.ts`: it saves after each change,
  one save at a time (changes made during a save are saved once after it). Progress changes record their undo step
  in `app/progress.ts` (`pushUndo`, `domain/undo.ts`).

Project rules (from [CLAUDE.md](../CLAUDE.md)):

- **Game safety.** Never read game memory, inject code, simulate input or automate the game. The meter may only
  passively read a copy of network traffic. Never decrypt it, never send packets, never hook rendering.
- **Server times** live only in `src/config.ts`, each marked `TO VERIFY`. Never invent one.
- **Resets** are computed from timestamps (`lastReset` vs the last boundary), never from timers, so they still work
  after the app was closed.
- **Dependencies.** Only the ones listed in CLAUDE.md. Ask before adding any other.
- UI text, notifications and code comments are in English. Ignore `spikes/` and `~/`.

## Common changes

### Change a reset or event time
Edit `src/config.ts` and keep the `TO VERIFY` marker until it has been checked in game. `reset.test.ts` covers the
edge cases (the app closed across resets, DST, month ends). Run it.

### Add a field to the save file
1. Add it to `AppData` / `Settings` in `src/domain/types.ts`.
2. Give it a default in `defaultData()` (`src/domain/save-file.ts`).
3. Fill it in `normalize()` with `raw.x ?? default`. Old saves and imported backups pass through there, so a missing
   field must never crash. Rename or drop old fields there too (see how `cloudReminder` / `eventAlerts` are migrated).

`AppData` is also the export format, so keep it small. Large logs go in their own store, like the Fight Log in
`fights.json` (`infra/fights.ts`).

### Add a page
1. Add the tab to `PAGE` in `src/ui/format.ts` (title + subtitle) and an icon in `src/ui/icons.ts`.
2. Create `src/ui/pages/YourPage.svelte` and add it to the `{#if ui.tab === ...}` chain in `App.svelte`.
3. Put its logic in `src/domain/` with a test, and read state from `ui.data` / `ui.meter` (`state.svelte.ts`).

### Add a Tauri command
Write the `#[tauri::command]` in `src-tauri/src/` (meter commands go in `meter.rs`), register it in
`generate_handler![...]` in `lib.rs`, and call it through a wrapper in `src/infra/` with a browser fallback.
A synchronous command runs on the UI thread, so make anything slow (device lists, I/O) `async`. Never call Win32
window functions while holding the meter's `auto` lock (that hung the app on 2026-10-24).

### Add something the meter reads
See [METER.md](METER.md#adding-a-new-record): find the record in a packet recording, parse it in a companion
module, add it to `engine::Update`, mirror the type in `src/domain/meter.ts`, then use it from `app/arena.ts`
(`takeMeterData`) or a page.

### Update the Wiki after a patch
Edit the constants in `src/domain/wiki.ts`. Use `{ v, note }` for any value with only one source or with sources
that disagree, bump `VERIFIED`, and list the sources. `wiki.test.ts` checks the shape.

### Seed tasks
`src/domain/seed.ts` holds the initial tasks from the original Sheet. They are only used for a new save, so existing
players never see changes to them.

## Releases

One workflow, `.github/workflows/release.yml`, runs on every push to `main` that changes more than `.md` files.

1. **check** (ubuntu): `npm test`, `tsc` for the app and `server/`, `svelte-check`, then works out what changed.
2. **server** (only if `server/` changed): applies the D1 migrations and deploys the Worker. No version bump.
3. **release** (only if something outside `server/` changed): `cargo test -p aion2-meter`, bumps the **patch**
   version in `package.json`, commits and tags it on `main`, builds the Windows installer, signs it, and publishes a
   GitHub Release with `latest.json`. Installed apps read `latest.json` to update themselves.

Notes:
- Don't bump the version by hand. It lives only in `package.json`. Pull after a merge to get the bump commit.
- For a minor or major release, use **Run workflow** in GitHub Actions and pick the bump (this runs both jobs).
- Nothing runs on branches or pull requests.
- Secrets used: `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)` for the updater signature, `CLOUDFLARE_API_TOKEN` /
  `CLOUDFLARE_ACCOUNT_ID` for the Worker.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `cargo metadata ... program not found` | Rust isn't on `PATH`: open a new terminal, or add `%USERPROFILE%\.cargo\bin` |
| DPS page says no capture | Install Npcap, then use the reconnect button on the DPS page |
| Meter numbers look wrong after a game patch | Opcodes were renumbered: update from A2Tools first ([METER.md](METER.md#syncing-with-a2tools)) |
| App crashed | `crash.log` in the app's log folder (`%LOCALAPPDATA%\it.hobby.aion2companion\logs`), written by `crash.rs` |
| Want a fresh start in the browser | Clear `localStorage` for `localhost:1420` |
| Want a fresh start in the desktop app | Export a backup, then delete `data.json` in `%APPDATA%\it.hobby.aion2companion\` |
