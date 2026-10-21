//! Starts the live engine and prints a few updates: `cargo run --example smoke`.
fn main() {
    let engine = aion2_meter::engine::Engine::start();
    for _ in 0..3 {
        std::thread::sleep(std::time::Duration::from_millis(500));
        println!("{}", serde_json::to_string(&engine.update()).unwrap());
    }
    engine.reset();
    engine.set_target_mode("allTargets");
    println!("capturing={}", engine.capturing());
}
