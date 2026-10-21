// DPS meter: starts the capture engine (crate `aion2-meter`, vendored from A2Tools) at app start,
// pushes "meter-update" events to every window, resets the fight after N seconds without
// activity, and shows the always-on-top overlay on activity / hides it when idle.
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use aion2_meter::engine::{Engine, Update};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// How often an update is computed (A2Tools' default rate), and resent when nothing changed.
const RATE: Duration = Duration::from_millis(200);
const RESEND: Duration = Duration::from_secs(3);

/// Seconds without damage, healing or damage taken before the fight resets (and the overlay hides).
const DEFAULT_IDLE_SECS: u32 = 15;

pub struct MeterState {
    engine: Mutex<Option<Arc<Engine>>>,
    auto: Mutex<Auto>,
}

struct Auto {
    /// The overlay is on: it shows when the fight moves and hides when it is idle.
    overlay: bool,
    /// 0 = never reset or hide.
    idle: Duration,
    last_active: Instant,
    /// Sum of damage, healing and damage taken at the last update: it grows while the fight goes on.
    last_total: f64,
}

impl Default for MeterState {
    fn default() -> Self {
        Self {
            engine: Mutex::new(None),
            auto: Mutex::new(Auto {
                overlay: false,
                idle: Duration::from_secs(DEFAULT_IDLE_SECS as u64),
                last_active: Instant::now(),
                last_total: 0.0,
            }),
        }
    }
}

fn engine(app: &AppHandle) -> Option<Arc<Engine>> {
    app.state::<MeterState>().engine.lock().ok()?.clone()
}

fn fight_total(u: &Update) -> f64 {
    u.fight.rows.iter().map(|r| r.damage + r.heal + r.damage_taken as f64).sum()
}

/// What the idle watch should do this update.
#[derive(Debug, PartialEq)]
enum Step {
    Nothing,
    /// The fight moved: show the overlay if it is on.
    Active,
    /// Idle: reset the fight (`true`) or there was nothing to reset, then hide the overlay.
    Idle(bool),
}

/// The fight is "active" while its totals grow (a reset or the switch to "My party" only shrinks
/// them); after `idle` without growth it resets. Never while paused.
fn idle_step(a: &mut Auto, total: f64, paused: bool, now: Instant) -> Step {
    if paused {
        a.last_active = now;
        a.last_total = total;
        return Step::Nothing;
    }
    let grew = total > a.last_total;
    a.last_total = total;
    if grew {
        a.last_active = now;
        return Step::Active;
    }
    if !a.idle.is_zero() && now.duration_since(a.last_active) >= a.idle {
        a.last_active = now; // once per idle period
        return Step::Idle(total > 0.0);
    }
    Step::Nothing
}

/// Starts capturing (once; later calls only return the current update). The main window calls
/// it at startup: boss timers, Odyle energy, character detection and the arena log need it.
#[tauri::command]
pub fn meter_start(app: AppHandle) -> Update {
    let state = app.state::<MeterState>();
    let mut slot = state.engine.lock().expect("meter state poisoned");
    if let Some(e) = slot.as_ref() {
        return e.update();
    }
    let e = Engine::start();
    let first = e.update();
    *slot = Some(e.clone());
    drop(slot);
    std::thread::Builder::new()
        .name("meter-updates".into())
        .spawn(move || {
            let mut last: Option<serde_json::Value> = None;
            let mut sent = Instant::now();
            loop {
                std::thread::sleep(RATE);
                let mut u = e.update();
                let step = {
                    let state = app.state::<MeterState>();
                    let mut a = state.auto.lock().expect("meter state poisoned");
                    let step = idle_step(&mut a, fight_total(&u), u.paused, Instant::now());
                    (step, a.overlay)
                };
                match step {
                    (Step::Active, true) => show_overlay(&app),
                    (Step::Idle(had_fight), overlay) => {
                        if had_fight {
                            e.reset();
                            u = e.update();
                        }
                        if overlay {
                            hide_overlay(&app);
                        }
                    }
                    _ => {}
                }
                let v = serde_json::to_value(&u).unwrap_or_default();
                if last.as_ref() != Some(&v) || sent.elapsed() >= RESEND {
                    let _ = app.emit("meter-update", &v);
                    last = Some(v);
                    sent = Instant::now();
                }
            }
        })
        .ok();
    first
}

#[tauri::command]
pub fn meter_reset(app: AppHandle) {
    if let Some(e) = engine(&app) {
        e.reset();
    }
}

#[tauri::command]
pub fn meter_pause(app: AppHandle, paused: bool) {
    if let Some(e) = engine(&app) {
        e.set_paused(paused);
    }
}

#[tauri::command]
pub fn meter_target_mode(app: AppHandle, mode: String) {
    if let Some(e) = engine(&app) {
        e.set_target_mode(&mode);
    }
}

#[tauri::command]
pub fn meter_party_only(app: AppHandle, on: bool) {
    if let Some(e) = engine(&app) {
        e.set_party_only(on);
    }
}

/// What the rows are ranked by: "damage" | "healing" | "taken". The overlay follows it.
#[tauri::command]
pub fn meter_view(app: AppHandle, view: String) {
    if let Some(e) = engine(&app) {
        e.set_view(&view);
    }
}

/// The players whose skill breakdown is open: only they get per-skill details in the updates.
#[tauri::command]
pub fn meter_watch(app: AppHandle, ids: Vec<i32>) {
    if let Some(e) = engine(&app) {
        e.watch_skills(ids);
    }
}

#[tauri::command]
pub fn meter_reconnect(app: AppHandle) {
    if let Some(e) = engine(&app) {
        e.reconnect();
    }
}

/// Seconds without activity before the fight resets and the overlay hides (0 = never).
/// Works before the engine starts: the setting is applied at launch.
#[tauri::command]
pub fn meter_idle(app: AppHandle, secs: u32) {
    if let Ok(mut a) = app.state::<MeterState>().auto.lock() {
        a.idle = Duration::from_secs(secs.min(3600) as u64);
    }
}

/// Turns the overlay on or off. On, it shows whenever the fight moves (now too, with `show_now`)
/// and hides after the idle time; off, it closes. Async on purpose: on Windows, building a window
/// inside a synchronous command deadlocks WebView2 and leaves a blank white window (Tauri's
/// `WebviewWindowBuilder` docs).
#[tauri::command]
pub async fn meter_overlay(app: AppHandle, show: bool, show_now: Option<bool>) -> Result<(), String> {
    if let Ok(mut a) = app.state::<MeterState>().auto.lock() {
        a.overlay = show;
        a.last_active = Instant::now();
    }
    // The main window's button follows it, also when it is turned off from the overlay.
    let _ = app.emit("meter-overlay", show);
    if !show {
        if let Some(w) = app.get_webview_window("overlay") {
            w.close().map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    if show_now.unwrap_or(true) {
        build_or_show(&app)?;
    }
    Ok(())
}

/// Hides the overlay until the fight moves again (it stays on).
#[tauri::command]
pub fn meter_overlay_hide(app: AppHandle) {
    hide_overlay(&app);
}

fn show_overlay(app: &AppHandle) {
    if let Err(e) = build_or_show(app) {
        eprintln!("overlay: {e}");
    }
}

fn hide_overlay(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.hide();
    }
}

/// A borderless, always-on-top window that never takes the focus from the game.
/// Over the game it needs borderless/windowed fullscreen.
fn build_or_show(app: &AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("overlay") {
        if !w.is_visible().unwrap_or(false) {
            w.show().map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("index.html#overlay".into()))
        .title("AION 2 Companion – DPS")
        .inner_size(340.0, 260.0)
        .min_inner_size(240.0, 120.0)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .focusable(false)
        .resizable(true)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn auto(idle: u64) -> Auto {
        Auto { overlay: true, idle: Duration::from_secs(idle), last_active: Instant::now(), last_total: 0.0 }
    }

    #[test]
    fn growth_is_activity_then_idle_resets_once() {
        let t0 = Instant::now();
        let mut a = auto(15);
        assert_eq!(idle_step(&mut a, 100.0, false, t0), Step::Active);
        assert_eq!(idle_step(&mut a, 100.0, false, t0 + Duration::from_secs(14)), Step::Nothing);
        assert_eq!(idle_step(&mut a, 100.0, false, t0 + Duration::from_secs(15)), Step::Idle(true));
        // After the reset the totals drop to 0: not activity, and no second reset right away.
        assert_eq!(idle_step(&mut a, 0.0, false, t0 + Duration::from_secs(16)), Step::Nothing);
        assert_eq!(idle_step(&mut a, 0.0, false, t0 + Duration::from_secs(31)), Step::Idle(false));
    }

    #[test]
    fn shrinking_totals_are_not_activity_and_pause_holds_the_timer() {
        let t0 = Instant::now();
        let mut a = auto(15);
        idle_step(&mut a, 500.0, false, t0);
        assert_eq!(idle_step(&mut a, 200.0, false, t0 + Duration::from_secs(1)), Step::Nothing); // "My party"
        assert_eq!(idle_step(&mut a, 200.0, true, t0 + Duration::from_secs(30)), Step::Nothing); // paused
        assert_eq!(idle_step(&mut a, 200.0, false, t0 + Duration::from_secs(40)), Step::Nothing);
        assert_eq!(idle_step(&mut a, 200.0, false, t0 + Duration::from_secs(45)), Step::Idle(true));
    }

    #[test]
    fn zero_means_never() {
        let t0 = Instant::now();
        let mut a = auto(0);
        idle_step(&mut a, 100.0, false, t0);
        assert_eq!(idle_step(&mut a, 100.0, false, t0 + Duration::from_secs(3600)), Step::Nothing);
    }
}
