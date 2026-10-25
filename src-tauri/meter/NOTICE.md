# aion2-meter: origin and changes

This crate is the DPS meter core of AION 2 Companion. Most of it is taken from
**A2Tools DPS Meter** by taengu, licensed under the GNU General Public License v3.0:

- Repository: https://github.com/taengu/a2tools-dps-meter
- Commit: `e6d4f6bec042fd44fbb0a4c9c3bd3519f78f634f` (2026-10-21), plus upstream fixes taken since:
  `7a0ad04` (2026-10-22, "Parser: a hit into a shield is its value; a DoT tick into one counts", whole commit).
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
6. `platform/` cut down to what capture needs: which libpcap to load, the game-window check and whether it is in front
   (adapted from A2Tools' `platform/win32`, `platform/linux`, `platform/procfs.rs`). No Npcap installer.
   The window checks skip the app's own windows (their title is never read: that sends them a message and
   waits for the UI thread, which hung the app, 2026-10-24).
7. Data: English skill and NPC names only (`data/i18n/{skills,npcs}/en.json`); `servers.json` not included.
   `skill_icons.json` added later (2026-10-21) for the skill icons; `snapshot.rs::skill_icon` follows A2Tools'
   `public/src/js/skillIcons.js` to name the icon on NCSOFT's CDN.
8. `combat/data_storage.rs` (2026-10-21): player-on-player hits, which the meter counts as party healing,
   are also recorded in a `pvp_ledger` (`PvpHits`, `note_pvp`, called first in `append_damage`'s
   friendly-action branch), with accessors `pvp_players`, `take_pvp_ledger` and `current_map_id`, and a
   test. What the meter counts is unchanged. The arena log reads them (`src/arena.rs`, `src/engine.rs`).
   Later: `pvp_ledger()`, a read-only copy for the kill history (`src/kills.rs`).
9. `capture/pcap_capturer.rs` (2026-10-24): `dropped()`, the count of packets thrown away because the parser
   fell behind, so the companion can say when its numbers miss some.
10. `combat/dps_calculator.rs` (2026-10-25): `world_boss_rows` (you, your party and Others from the HP lost) also
   applies to the Abyss's open-world bosses (`abyss_bosses.rs`), which the field-boss list leaves out; a test
   for it (`an_abyss_world_boss_shows_others_too`).

## Written for the companion

`src/engine.rs` (starts the pipeline the way A2Tools' `app.rs` does; boss timers, Odyle energy, profile),
`src/snapshot.rs` (the DPS tab's view of an update), `src/arena.rs` (arena matches from the PvP ledger),
`src/recorder.rs` (packet recorder for diagnostics), `src/position.rs` (your position from map loads,
teleports and your own buffs), `src/cubes.rs` (hidden cubes in view and opened), `src/kills.rs` (your PvP kills and deaths, with
`DataStorage::pvp_ledger`, a read-only copy of the companion's PvP ledger),
`src/souls.rs` (your mob kills that gave soul points, and where the mob died),
`src/abyss_bosses.rs` (the Abyss's open-world bosses, for the Others row),
`src/tap.rs` (all of them on A2Tools' frame tap),
`src/lib.rs`, `examples/smoke.rs`. Same license (GPL-3.0).

## Game data

Skill and NPC names are NCSOFT's, from the game client, as collected by A2Tools.
AION is a trademark of NCSOFT Corporation. This project is not affiliated with NCSOFT.
