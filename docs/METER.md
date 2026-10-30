# The DPS meter (`src-tauri/meter`, crate `aion2-meter`)

The meter reads a **copy** of the game's network traffic, parses the game's records and keeps the state the app
shows: fights, bosses, arena, position, cubes, pets, currencies. Most of the core is vendored from
[A2Tools DPS Meter](https://github.com/taengu/a2tools-dps-meter) (GPL-3.0). The rest is companion code.

## Hard rules

- Passive only: Npcap/libpcap capture of a copy of the traffic. **Never** decrypt traffic, send packets, read or
  write game memory, inject code, hook rendering or simulate input.
- Keep A2Tools' files as close to upstream as possible. List **every** change to them in
  [`src-tauri/meter/NOTICE.md`](../src-tauri/meter/NOTICE.md). Put new logic in companion files instead.
- Allowed crate dependencies: serde, serde_json, lz4_flex, parking_lot, tracing, libloading, tokio, windows.

## Pipeline

```
Npcap (libloading)          capture/pcap_capturer.rs   finds the device, counts dropped packets
  → port detection          capture/combat_port_detector.rs
  → TCP order               capture/tcp_order.rs        retransmits once, out-of-order waits ≤ 1 s   [companion]
  → stream / framing        capture/stream_assembler.rs, stream_processor.rs, framing.rs (lz4 bundles)
  → dispatcher              combat/capture_dispatcher.rs
  → DataStorage             combat/data_storage.rs      hits, heals, buffs, entities, PvP ledger
  → DpsCalculator           combat/dps_calculator.rs    rows per player, Others on world bosses
  → engine::Update          engine.rs + snapshot.rs     what the app gets every 200 ms                [companion]

frame tap (capture/frame_tap.rs, one slot) → tap.rs → position, cubes, souls, pets, currencies, roster, recorder
```

`engine.rs` starts the pipeline the way A2Tools' `app.rs` does, without its windows, uploads or plugins. English
skill/NPC names and the DoT list are compiled into the binary (`include_str!` from `data/`).

The `live` cargo feature (default) adds the real capture (Npcap loading, game-window check, threads). Without it the
parser and aggregation still build, which is what tests and replays use (`Engine::offline`).

## Companion modules

| File | Reads |
|---|---|
| `engine.rs` | Pipeline start, `Update`, boss timers, Odyle energy, profile, idle reset |
| `snapshot.rs` | The DPS tab's view of a fight; skill icons |
| `position.rs` | Your map and position (map loads, teleports, your buffs) |
| `cubes.rs` | Hidden cubes in view (learned object codes) and openings |
| `souls.rs` | Mob kills that gave soul points, loots with item codes |
| `pets.rs` | Pet collection, sent on entering the world (`00 90`) |
| `currencies.rs` | Inventory currencies (`11 56` whole, `1b 56` changes) |
| `roster.rs` | Arena line-up (`19 e3`); other players' servers from spawns (`45 36`) |
| `arena.rs` | Arena matches built from the PvP ledger + roster |
| `kills.rs` | Your PvP kills, assists, deaths |
| `abyss_bosses.rs` | Abyss world bosses (rows for you, your party, Others) |
| `recorder.rs` | Packet recorder for diagnostics |
| `tap.rs` | Puts all of the above on the one-slot frame tap; `tap::embedded` for bundled frames |

Record ids above are the first two bytes of a frame as shown in recordings. [CLAUDE.md](../CLAUDE.md) has the byte
layouts that are known.

## From Rust to the app

`src-tauri/src/meter.rs` owns the engine. It exposes `meter_*` commands (`meter_start` is `async` and starts the engine
on a blocking thread, because Npcap's device list can hang the UI thread), emits `meter-update` to every window,
resets the fight after `dpsIdleSeconds` without activity, and shows or hides the overlays.

On the TypeScript side, `src/domain/meter.ts` mirrors the `Update` types (camelCase via serde) and holds formatting.
`src/infra/meter.ts` wraps the commands and events, and outside Tauri it plays a demo fight. See
[ARCHITECTURE.md](ARCHITECTURE.md#the-meter--ui-flow) for what the app does with each update.

## Recording and replaying traffic

This is how new records are found and how parser bugs are reproduced.

1. In the app: **Settings > Diagnostics > Record game packets**. Every frame the meter reads goes to
   `Downloads/aion2-packets-<unix seconds>.txt` (stops after 15 min or 200 MB). While recording, press the **Mark**
   buttons at the moment something happens (a cube in view, a cube opened…).
2. File format, one entry per line:
   - `# ...` header
   - `F <ms> <hex>` a frame
   - `E <ms> <hex>` a frame from a bundle inside another packet
   - `M <ms> <label>` a mark
   - `<ms>` counts from the start of the recording.
3. Compare the frames around the marks to find the record and its layout.
4. Replay it offline, as the app would have read it:

   ```bash
   cd src-tauri
   cargo run -p aion2-meter --example replay -- path/to/aion2-packets-1792345678.txt [--map <id>] [--leave]
   ```

   `--map` says which map the recording started on, and `--leave` adds a map load to the open world at the end (so a
   running match ends). It prints the arena match, kills and deaths whenever they change.
5. Live check without the app: `cargo run -p aion2-meter --example smoke`.

Recordings stay on the player's disk. Nothing is uploaded.

## Adding a new record

1. Find it in a recording (above). Save a few real frames as a byte sample for the test (see the `.hex` files in
   `src/` and `capture/testdata/`).
2. Parse it in a companion module with an `observe(frame, …)` function, hook that into `tap::install`, and write a
   unit test with the sample.
3. Add the result to `engine::Update` (serde camelCase) and mirror the type in `src/domain/meter.ts`.
4. Use it in the app: `app/arena.ts` `takeMeterData` for anything kept in the save file, or straight from `ui.meter`
   in a page.
5. Run `cargo test -p aion2-meter`, `npm test` and `npm run check`. Then check it live with the game.

If the change has to touch an A2Tools file, keep it minimal and add a numbered entry to `meter/NOTICE.md`.

## Syncing with A2Tools

Game patches renumber opcodes, and A2Tools usually updates first. **Update from A2Tools before** trying to fix the
parser yourself.

1. `meter/NOTICE.md` records the upstream commit this crate is based on, plus the upstream fixes taken since.
2. Diff upstream's `src-tauri/src/{capture,combat,entity,i18n,clock.rs}` and `src/data/` against this crate.
3. Take the changes, then re-apply the numbered companion changes from NOTICE.md that conflict.
4. Update the commit and date in NOTICE.md, and run `cargo test -p aion2-meter`.

## Debugging tips

- **Status** in `Update`: `no-capture` (Npcap missing or no device), `waiting-game`, `searching` (no game port yet:
  Reconnect, or start the app before the game), `connected`.
- **`lost_packets`** counts packets dropped because the parser fell behind (crowded fights). The DPS page warns about it.
- **Junk after entering the world** used to come from out-of-order TCP segments (`tcp_order.rs`). The recorder marks
  port changes, lost packets and skipped gaps.
- **App hangs**: never call Win32 window functions while holding `auto` in `meter.rs`, and never read another
  window's title from the window checks (it sends that window a message).
