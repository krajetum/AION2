//! Replays a packet recording (Settings > Diagnostics) through the meter, as the app would have read it:
//! `cargo run -p aion2-meter --example replay -- <recording.txt>`. Prints the arena match, kills and
//! deaths whenever they change. Only `F` lines are fed (`E` lines are already inside them).
//! `--map <id>`: the recording started on that map (its load came before); `--leave`: then a map load to the
//! open world (1110) after the last frame, so a match still on ends as when the player leaves it.
use std::io::BufRead;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let path = args.iter().find(|a| !a.starts_with("--") && a.parse::<i32>().is_err()).cloned().expect("usage: replay <recording.txt> [--map <id>] [--leave]");
    let start_map = args.iter().position(|a| a == "--map").and_then(|i| args.get(i + 1)?.parse::<i32>().ok());
    let leave = args.iter().any(|a| a == "--leave");
    let (engine, mut processor) = aion2_meter::engine::Engine::offline();
    if let Some(map) = start_map {
        engine.note_map_load(map);
    }
    // Recording times count from its start; the file name holds the start in unix seconds.
    let base = path.rsplit("packets-").next().and_then(|s| s.split(|c: char| !c.is_ascii_digit()).next())
        .and_then(|s| s.parse::<i64>().ok()).map_or(1_800_000_000_000, |s| s * 1000);
    let (mut last_arena, mut last_kills, mut next_update, mut last_deaths) = (String::new(), String::new(), 0i64, 0usize);
    let mut show = |engine: &aion2_meter::engine::Engine, at: i64| {
        aion2_meter::clock::set_override(Some(at));
        let u = engine.update();
        let arena = serde_json::to_string_pretty(&u.arena).unwrap();
        if arena != last_arena {
            println!("[{:>7.1} s] arena: {arena}", (at - base) as f64 / 1000.0);
            last_arena = arena;
        }
        if u.pvp_deaths.len() != last_deaths {
            println!("[{:>7.1} s] enemy player deaths (last 10 min): {}", (at - base) as f64 / 1000.0, u.pvp_deaths.len());
            last_deaths = u.pvp_deaths.len();
        }
        let kills = serde_json::to_string(&u.kills).unwrap();
        if kills != last_kills {
            println!("[{:>7.1} s] kills: {kills}", (at - base) as f64 / 1000.0);
            last_kills = kills;
        }
    };
    let file = std::fs::File::open(&path).expect("cannot open the recording");
    for line in std::io::BufReader::new(file).lines().map_while(Result::ok) {
        let mut parts = line.splitn(3, ' ');
        let (kind, ms, rest) = (parts.next(), parts.next(), parts.next().unwrap_or(""));
        let Some(ms) = ms.and_then(|m| m.parse::<i64>().ok()) else { continue };
        let at = base + ms;
        match kind {
            Some("F") => {
                let Some(frame) = (0..rest.len()).step_by(2).map(|i| u8::from_str_radix(rest.get(i..i + 2)?, 16).ok()).collect::<Option<Vec<u8>>>() else { continue };
                aion2_meter::clock::set_override(Some(at));
                processor.set_override_timestamp(Some(at));
                processor.consume_stream(&frame);
            }
            Some("M") => println!("[{:>7.1} s] mark: {rest}", ms as f64 / 1000.0),
            _ => continue,
        }
        if at >= next_update {
            show(&engine, at);
            next_update = at + 200;
        }
    }
    // Past the last frame: deaths are read 2.5 s late.
    show(&engine, base + 10_000_000);
    if leave {
        engine.note_map_load(1110);
        show(&engine, base + 10_000_100);
    }
}
