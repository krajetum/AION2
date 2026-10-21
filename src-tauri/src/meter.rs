// DPS meter: starts the capture engine (crate `aion2-meter`, vendored from A2Tools) on demand,
// pushes "meter-update" events to every window and opens the always-on-top overlay window.
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use aion2_meter::engine::{Engine, Update};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// How often an update is computed (A2Tools' default rate), and resent when nothing changed.
const RATE: Duration = Duration::from_millis(200);
const RESEND: Duration = Duration::from_secs(3);

#[derive(Default)]
pub struct MeterState(Mutex<Option<Arc<Engine>>>);

fn engine(app: &AppHandle) -> Option<Arc<Engine>> {
    app.state::<MeterState>().0.lock().ok()?.clone()
}

/// Starts capturing (once; later calls only return the current update). Nothing is
/// captured until the user opens the DPS page, so the app costs nothing for those who don't.
#[tauri::command]
pub fn meter_start(app: AppHandle) -> Update {
    let state = app.state::<MeterState>();
    let mut slot = state.0.lock().expect("meter state poisoned");
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
                let v = serde_json::to_value(e.update()).unwrap_or_default();
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

/// Shows or hides the compact overlay: a borderless, always-on-top window that never
/// takes the focus from the game. Over the game it needs borderless/windowed fullscreen.
/// Async on purpose: on Windows, building a window inside a synchronous command deadlocks
/// WebView2 and leaves a blank white window (Tauri's `WebviewWindowBuilder` docs).
#[tauri::command]
pub async fn meter_overlay(app: AppHandle, show: bool) -> Result<(), String> {
    // The main window's button follows the overlay, also when it is closed from the overlay.
    let _ = app.emit("meter-overlay", show);
    if let Some(w) = app.get_webview_window("overlay") {
        return if show { w.show().map_err(|e| e.to_string()) } else { w.close().map_err(|e| e.to_string()) };
    }
    if !show {
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, "overlay", WebviewUrl::App("index.html#overlay".into()))
        .title("AION 2 Companion – DPS")
        .inner_size(340.0, 260.0)
        .min_inner_size(240.0, 120.0)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .resizable(true)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
