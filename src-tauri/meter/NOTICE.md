# aion2-meter: origin and changes

This crate is the DPS meter core of AION 2 Companion. Most of it is taken from
**A2Tools DPS Meter** by taengu, licensed under the GNU General Public License v3.0:

- Repository: https://github.com/taengu/a2tools-dps-meter
- Commit: `e6d4f6bec042fd44fbb0a4c9c3bd3519f78f634f` (2026-10-21)
- License: GPL-3.0 (see `LICENSE` at the root of this repository)

Like A2Tools, it only reads a copy of the game's network traffic through Npcap (Windows)
or libpcap (Linux). It never reads or writes the game's memory or files, injects nothing
and sends nothing to the game or anywhere else.

## Files taken from A2Tools (`src-tauri/src/…` there)

`src/capture/`, `src/combat/`, `src/entity/`, `src/i18n/`, `src/clock.rs`, and the data in
`data/` (from `src/data/` there).

## Changes made for the companion (2026-10-21)

1. `capture/evidence_slice.rs` removed (A2Tools' fight upload feature); its `mod` line removed from `capture/mod.rs`.
2. The `desktop` and `online` cargo features are one feature here, `live`.
3. `combat/capture_dispatcher.rs`: the calls to A2Tools' packet log (`logging::logger::log_packet`) and
   share ring buffer (`share::ring::record`) are removed. Nothing is logged to disk or kept for upload.
4. `include_str!` paths to `data/` adjusted to this crate's layout. Tests: data paths adjusted, and the
   tests that looped over every language table loop over English only (the only names shipped here).
5. `supporters.rs` replaced by an empty stub (A2Tools downloads a supporter roster; the companion downloads nothing).
6. `platform/` cut down to what capture needs: which libpcap to load and the game-window check
   (adapted from A2Tools' `platform/win32`, `platform/linux`, `platform/procfs.rs`). No Npcap installer.
7. Data: English skill and NPC names only (`data/i18n/{skills,npcs}/en.json`); `servers.json` and
   `skill_icons.json` not included.

## Written for the companion

`src/engine.rs` (starts the pipeline the way A2Tools' `app.rs` does), `src/snapshot.rs` (the DPS tab's
view of an update), `src/lib.rs`, `examples/smoke.rs`. Same license (GPL-3.0).

## Game data

Skill and NPC names are NCSOFT's, from the game client, as collected by A2Tools.
AION is a trademark of NCSOFT Corporation. This project is not affiliated with NCSOFT.
