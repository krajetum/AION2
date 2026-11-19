//! Records the game connection from the command line, as Settings > Diagnostics does with "game connection" and
//! "known items" ticked: `cargo run -p aion2-meter --example record -- [seconds] [other] [out dir]` (default 300 s, Downloads).
//! Item names come from `src/assets/recipes.json` and the currencies. A line on stdin is written as a mark.
use std::collections::HashMap;
use std::io::BufRead;
use std::time::{Duration, Instant};

fn main() {
    let mut args = std::env::args().skip(1).peekable();
    let secs: u64 = args.next().and_then(|s| s.parse().ok()).unwrap_or(300);
    // "other": also the game's other TCP connections (`C` lines), as the Diagnostics tick of that name.
    let other = args.next_if(|a| a == "other").is_some();
    let dir = args.next().map(Into::into).unwrap_or_else(|| {
        std::path::PathBuf::from(std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).unwrap_or_default()).join("Downloads")
    });

    let recipes: serde_json::Value =
        serde_json::from_str(include_str!("../../../src/assets/recipes.json")).expect("recipes.json");
    let mut items: HashMap<u32, String> = recipes["items"]
        .as_object()
        .unwrap()
        .iter()
        .filter_map(|(code, name)| Some((code.parse().ok()?, name.as_str()?.to_string())))
        .collect();
    for (code, name) in [(930_100_031, "Kina"), (930_100_001, "Bound Kina"), (930_100_003, "Abyss Points"), (930_100_017, "Nightmare Coins"), (930_100_011, "Shugo Coins")] {
        items.insert(code, name.into());
    }

    let engine = aion2_meter::engine::Engine::start();
    let kinds = aion2_meter::recorder::Kinds { combat: true, items: true, other };
    let path = aion2_meter::recorder::start_with(&dir, kinds, items).expect("start recording");
    println!("Recording {secs} s to {} (capturing={})", path.display(), engine.capturing());

    std::thread::spawn(|| {
        for line in std::io::stdin().lock().lines().map_while(Result::ok) {
            if !line.trim().is_empty() {
                aion2_meter::recorder::mark(line.trim());
                println!("mark: {}", line.trim());
            }
        }
    });
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(secs) {
        std::thread::sleep(Duration::from_secs(10));
        let u = engine.update();
        println!("{:>4} s  {}", start.elapsed().as_secs(), u.message);
    }
    let s = aion2_meter::recorder::stop();
    println!("Stopped: {}", serde_json::to_string(&s).unwrap());
}
