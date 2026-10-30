# AION 2 Companion

A Windows desktop companion for AION 2 (EU servers): a tracker for recurring tasks, with a passive DPS meter.
It replaces a Google Sheet. Single user, multiple characters, and everything is stored on your PC.

## Features

**Tracking**
- **Daily / Weekly / Monthly tasks** for each character, with numeric goals (e.g. "2000 Abyss mobs"). Progress resets
  on its own at server reset times, even if the app was closed when the reset happened. Undo with Ctrl+Z.
- **Auto-tracked tasks**: give a task a trigger (a map entered, a boss killed, an arena match, a PvP kill) and
  the meter ticks it when it sees that happen in game.
- **Planner**: tell it how many minutes you have and it picks the best set of unfinished tasks for that time. Events
  are pinned, and it learns how long each task takes.
- **Season Coins**: Season Oath Coin missions, coins claimed, still to claim this week, and a projection.
- **Notifications**: reset warnings, events, Cloud Merchant, field-boss respawns and news, with quiet hours,
  volume per channel and a tray "mute for an hour".
- **News**: the official AION 2 announcements from Steam.

**Meter** (needs [Npcap](https://npcap.com/))
- **DPS Meter**: damage, healing and damage taken per player, with a skill breakdown and an always-on-top overlay.
- **Fight Log**: every boss fight, your personal bests, and two runs side by side.
- **Arena Log**: every arena match, your opponents with their server and gear, and your kills and deaths.
- **Field Bosses**: respawn timers from the maps you open in game, shared with other players if you opt in.
- **Map**: hidden cubes (with an in-game popup and a radar overlay) and where pets' soul points drop.
- **Pets**: your pet collection, what is left to collect, and where to find it.
- **Wallet**: each character's currencies and Odyle energy, in the sidebar.

**Wiki**: Expeditions, Transcendence and Dungeon Rules, collected from online guides.

### What the meter does and doesn't do

The meter only reads a **copy** of the game's network traffic through Npcap, the same way Wireshark does. It never
reads or writes game memory, never injects code, never decrypts traffic, never sends packets and never automates
input. The overlays are ordinary always-on-top windows.

## Install

1. Download the latest installer from [Releases](https://github.com/krajetum/AION2/releases).
2. For the meter, install [Npcap](https://npcap.com/). The tracker works without it.
3. Launch the app and add your characters in **Settings**. Updates install automatically.

Your data lives in `%APPDATA%\it.hobby.aion2companion\` (`data.json`, `fights.json`). Use **Settings > Export JSON**
for a backup, and **Import JSON** to restore it.

Optional sharing: with **Settings > Share boss timers and cube spots** on, the app sends the boss timers and cube openings it sees to a
small server, and gets everyone else's back. It sends no player names, only a random install id.

## Build from source

You need Node.js 24+, Rust with the MSVC toolchain, and Npcap for the meter.

```bash
npm install
npm run tauri dev      # desktop app (the first build takes about 2 min)
npm run dev            # UI only, in a browser at http://localhost:1420 (demo DPS fight, no tray or toasts)
```

If the build fails with `cargo metadata ... program not found`, the terminal can't find Rust. Open a new terminal
after installing Rust, or check that `%USERPROFILE%\.cargo\bin` is on `PATH`.

Checks:

```bash
npm test
npm run check
cargo test -p aion2-meter --manifest-path src-tauri/Cargo.toml
```

## Documentation

| Doc | For |
|---|---|
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup, commands, testing, conventions, common changes, releases |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, startup, the save file, the meter → UI flow, windows |
| [docs/METER.md](docs/METER.md) | The Rust DPS meter crate: pipeline, companion modules, recordings, upstream sync |
| [docs/SERVER.md](docs/SERVER.md) | The optional crowdsourcing Worker: API, schema, limits, deploy |
| [CLAUDE.md](CLAUDE.md) | File-by-file reference of the codebase |

## License

GPL-3.0. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md). The DPS meter core comes from
[A2Tools DPS Meter](https://github.com/taengu/a2tools-dps-meter) (GPL-3.0), and
[src-tauri/meter/NOTICE.md](src-tauri/meter/NOTICE.md) lists every change made to it.
The bundled map images in `src/assets/ncsoft/` are © NCSOFT and are not covered by the GPL.

This is an unofficial fan project, not affiliated with NCSOFT. Third-party tools may be against the game's terms of
service, so use it at your own risk.
