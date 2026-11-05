# AION 2 Companion

A Windows desktop tracker for recurring AION 2 tasks (EU server), with a passive DPS meter.

- **Task tracker**: daily and weekly tasks for each of your characters. Progress resets on its own at server reset times, even if the app was closed when the reset happened.
- **Notifications**: reminders for events and unfinished tasks, with quiet hours and adjustable volume.
- **Session planner**: give it a number of minutes and it picks the best set of unfinished tasks to fit.
- **Season tracker**: Season Oath Coin missions and a summary of your progress.
- **DPS meter**: damage, healing and damage taken, a skill breakdown, field-boss timers and an arena log, with an always-on-top overlay. The meter only reads a copy of the game's network traffic (through Npcap). It never touches game memory, never injects code and never sends packets.

Everything is stored locally. Single user, multiple characters.

## Quick start

### Install

1. Download the latest installer from [Releases](https://github.com/krajetum/AION2/releases).
2. For the DPS meter, install [Npcap](https://npcap.com/). The tracker works without it.
3. Launch the app and add your characters. Updates install automatically.

### Build from source

Prerequisites: Node.js 24+, Rust with the MSVC toolchain, and [Npcap](https://npcap.com/) for the meter.

```bash
npm install
```

```bash
npm run tauri dev
```

The first build takes about 2 minutes. If it fails with `cargo metadata ... program not found`, the terminal can't find Rust: open a new terminal after installing Rust, or check that `%USERPROFILE%\.cargo\bin` is on `PATH`. To work on the UI in a browser instead (no tray or notifications, and the DPS page shows a demo fight):

```bash
npm run dev
```

Then open http://localhost:1420.

### Checks

```bash
npm test
```

```bash
npm run check
```

```bash
cargo test -p aion2-meter --manifest-path src-tauri/Cargo.toml
```

## License

GPL-3.0. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md). The DPS meter core comes from [A2Tools DPS Meter](https://github.com/taengu/a2tools-dps-meter) (GPL-3.0).

Unofficial fan project, not affiliated with NCSOFT. Third-party tools may be against the game's terms of service, so use them at your own risk.
