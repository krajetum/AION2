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
/// How often to ask which window is in front (for hiding the overlays on alt-tab).
const FRONT_CHECK: Duration = Duration::from_millis(500);
const OVERLAY: &str = "overlay";
const EVENTS: &str = "events";
const CUBE: &str = "cube";
const RADAR: &str = "radar";
const NET: &str = "net";
const SOULS: &str = "souls";
/// The "Edit overlays" panel (like the game's Edit HUD): every overlay that is on shows with a frame to drag and resize.
const HUD: &str = "hud";
/// Updates between two checks of the windows against what should show (5 × 200 ms).
const RECHECK_EVERY: u32 = 5;
/// The overlay windows, in the panel's order.
pub const OVERLAYS: [&str; 6] = [OVERLAY, EVENTS, CUBE, RADAR, NET, SOULS];

/// Seconds without damage, healing or damage taken before the fight resets (and the overlay hides).
const DEFAULT_IDLE_SECS: u32 = 15;

pub struct MeterState {
    engine: Mutex<Option<Arc<Engine>>>,
    /// Held while the engine starts, so it starts once; `engine` itself stays free for the commands.
    starting: Mutex<()>,
    auto: Mutex<Auto>,
}

struct Auto {
    /// The overlay is on: it shows when the fight moves and hides when it is idle.
    overlay: bool,
    /// The fight is on (or the overlay was just turned on): the overlay should be up.
    wanted: bool,
    /// The event countdown overlay is on.
    events: bool,
    /// The "hidden cube nearby" popup is on, and a cube is in view now.
    cube: bool,
    cube_near: bool,
    /// The cube popup's size: 1 = 260 × 96.
    cube_scale: f64,
    /// The radar (cubes around you, to lay over the game's minimap) is on. It shows with the cube popup's news only
    /// (a cube in view, or one just opened), so it needs no key to hide it (the player's choice, 2026-11-01).
    radar: bool,
    /// The small ping and packet loss overlay is on.
    net: bool,
    /// The soul points popup is on (`souls_popup`), and up until this time (ms): the last gain + its few seconds.
    souls: bool,
    souls_until: i64,
    souls_near: bool,
    /// The popup's last combo (the app's `SoulPop`), for a window that was just made (`souls_popup_state`).
    souls_pop: Option<serde_json::Value>,
    /// The popup's size: 1 = SOULS_SIZE (Settings: XS 0.7 … XL 1.6).
    souls_scale: f64,
    /// Hide the overlays while another window than the game is in front (alt-tab).
    follow_game: bool,
    /// The game window was in front at the last check.
    front: bool,
    /// Background opacity of the overlays, 20..=100 %.
    opacity: u8,
    /// 0 = never reset or hide.
    idle: Duration,
    last_active: Instant,
    /// Sum of damage, healing and damage taken at the last update: it grows while the fight goes on.
    last_total: f64,
    /// "Edit overlays" is open: every overlay that is on shows, whatever is in front and whatever it has to say.
    edit: bool,
    /// Where the overlays were when editing began (Cancel puts them back).
    edit_from: Vec<(String, crate::places::Place)>,
}

impl Auto {
    /// Which overlays should be on screen.
    fn visible(&self) -> Visible {
        let front = self.front || !self.follow_game;
        if self.edit {
            return Visible { dps: self.overlay, events: self.events, cube: self.cube, radar: self.radar, net: self.net, souls: self.souls };
        }
        Visible {
            dps: self.overlay && self.wanted && front,
            events: self.events && front,
            cube: self.cube && self.cube_near && front,
            radar: self.radar && self.cube_near && front,
            net: self.net && front,
            souls: self.souls && self.souls_near && front,
        }
    }
    fn any(&self) -> bool {
        self.overlay || self.events || self.cube || self.radar || self.net || self.souls
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Visible {
    dps: bool,
    events: bool,
    cube: bool,
    radar: bool,
    net: bool,
    souls: bool,
}

impl Default for MeterState {
    fn default() -> Self {
        Self {
            engine: Mutex::new(None),
            starting: Mutex::new(()),
            auto: Mutex::new(Auto {
                overlay: false,
                wanted: false,
                events: false,
                cube: false,
                cube_near: false,
                cube_scale: 1.0,
                radar: false,
                net: false,
                souls: false,
                souls_until: 0,
                souls_near: false,
                souls_pop: None,
                souls_scale: 1.0,
                follow_game: true,
                front: true,
                opacity: 90,
                idle: Duration::from_secs(DEFAULT_IDLE_SECS as u64),
                last_active: Instant::now(),
                last_total: 0.0,
                edit: false,
                edit_from: Vec::new(),
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

/// How long the cube popup stays up after a cube is opened ("Cube opened").
const OPENED_SHOWN_MS: i64 = 5_000;
const CUBE_SIZE: (f64, f64) = (260.0, 96.0);
/// The soul points popup at size M (Settings).
const SOULS_SIZE: (f64, f64) = (220.0, 84.0);

/// The cube popup has something to say: a cube in view, or one opened in the last few seconds.
fn cube_news(c: &aion2_meter::cubes::Cubes, now_ms: i64) -> bool {
    !c.live.is_empty() || c.opened.last().is_some_and(|o| now_ms - o.at_ms < OPENED_SHOWN_MS)
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
///
/// Async, and the start itself on a blocking thread: a synchronous command runs on the UI thread,
/// and starting the capture asks Npcap for every network device, which on some PCs takes long or
/// never returns. The window then stayed white and "not responding" from launch (2026-10-24, every
/// version since the meter came in; 0.3.0, before it, was fine).
#[tauri::command]
pub async fn meter_start(app: AppHandle) -> Result<Update, String> {
    tauri::async_runtime::spawn_blocking(move || start(app)).await.map_err(|e| e.to_string())
}

fn start(app: AppHandle) -> Update {
    let e = {
        let state = app.state::<MeterState>();
        let _once = state.starting.lock().expect("meter state poisoned");
        if let Some(e) = engine(&app) {
            return e.update();
        }
        let e = Engine::start();
        *state.engine.lock().expect("meter state poisoned") = Some(e.clone());
        e
    };
    let first = e.update();
    std::thread::Builder::new()
        .name("meter-updates".into())
        .spawn(move || {
            let mut last: Option<serde_json::Value> = None;
            let mut sent = Instant::now();
            let mut front_checked = Instant::now() - FRONT_CHECK;
            let mut shown: Option<Visible> = None;
            let mut checks = 0u32;
            loop {
                std::thread::sleep(RATE);
                let mut u = e.update();
                // The game in front? Asked twice a second, and only when it matters, never while holding
                // `auto`: the commands that change the overlays lock it on the UI thread.
                let front = {
                    let state = app.state::<MeterState>();
                    let a = state.auto.lock().expect("meter state poisoned");
                    a.follow_game && a.any() && front_checked.elapsed() >= FRONT_CHECK
                }
                .then(|| {
                    front_checked = Instant::now();
                    aion2_meter::platform::window_detector::is_aion2_foreground()
                });
                let (step, want) = {
                    let state = app.state::<MeterState>();
                    let mut a = state.auto.lock().expect("meter state poisoned");
                    let step = idle_step(&mut a, fight_total(&u), u.paused, Instant::now());
                    match step {
                        Step::Active => a.wanted = true,
                        Step::Idle(_) => a.wanted = false,
                        Step::Nothing => {}
                    }
                    a.cube_near = cube_news(&u.cubes, aion2_meter::clock::now_ms());
                    a.souls_near = aion2_meter::clock::now_ms() < a.souls_until;
                    if let Some(f) = front {
                        a.front = f;
                    }
                    (step, a.visible())
                };
                if let Step::Idle(true) = step {
                    e.reset();
                    u = e.update();
                }
                // Once a second the windows are checked against what should show too, not only on a change: after
                // "Edit overlays" the cube popup and the radar stayed on screen with no cube (2026-11-24).
                checks = (checks + 1) % RECHECK_EVERY;
                if Some(want) != shown || checks == 0 {
                    let check = Some(want) == shown;
                    for (label, on) in [(OVERLAY, want.dps), (EVENTS, want.events), (CUBE, want.cube), (RADAR, want.radar), (NET, want.net), (SOULS, want.souls)] {
                        if !check {
                            set_visible(&app, label, on);
                        } else if let Some(w) = app.get_webview_window(label) {
                            if w.is_visible().unwrap_or(on) != on {
                                set_visible(&app, label, on);
                            }
                        }
                    }
                    shown = Some(want);
                }
                crate::places::flush();
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

/// Turns the overlay on or off. On, it shows whenever the fight moves (now too, with `show_now`),
/// hides after the idle time and while another window is in front; off, it closes.
/// The update thread shows and hides the windows (and builds them: never inside a synchronous
/// command, which on Windows deadlocks WebView2 and leaves a blank white window).
#[tauri::command]
pub async fn meter_overlay(app: AppHandle, show: bool, show_now: Option<bool>) -> Result<(), String> {
    if let Ok(mut a) = app.state::<MeterState>().auto.lock() {
        a.overlay = show;
        a.wanted = show && show_now.unwrap_or(true);
        a.last_active = Instant::now();
    }
    // The main window's button follows it, also when it is turned off from the overlay.
    let _ = app.emit("meter-overlay", show);
    if !show {
        close(&app, OVERLAY);
    }
    Ok(())
}

/// Hides the overlay until the fight moves again (it stays on).
#[tauri::command]
pub fn meter_overlay_hide(app: AppHandle) {
    if let Ok(mut a) = app.state::<MeterState>().auto.lock() {
        a.wanted = false;
    }
}

/// The event countdown overlay on or off (it hides with the DPS overlay while another window is in front).
#[tauri::command]
pub async fn events_overlay(app: AppHandle, show: bool) -> Result<(), String> {
    if let Ok(mut a) = app.state::<MeterState>().auto.lock() {
        a.events = show;
    }
    // The main window saves the switch, also when it is turned off from the overlay itself.
    let _ = app.emit("events-overlay", show);
    if !show {
        close(&app, EVENTS);
    }
    Ok(())
}

/// Overlay behaviour: hide while another window than the game is in front, and background opacity (20..=100 %).
#[tauri::command]
pub fn overlay_style(app: AppHandle, follow_game: bool, opacity: u8) {
    let opacity = opacity.clamp(20, 100);
    if let Ok(mut a) = app.state::<MeterState>().auto.lock() {
        a.follow_game = follow_game;
        if !follow_game {
            a.front = true;
        }
        a.opacity = opacity;
    }
    let _ = app.emit("overlay-opacity", opacity);
}

/// The overlays' background opacity, for an overlay window as it opens.
#[tauri::command]
pub fn overlay_opacity(app: AppHandle) -> u8 {
    app.state::<MeterState>().auto.lock().map(|a| a.opacity).unwrap_or(90)
}

/// Packet recorder (Settings > Diagnostics): what `kinds` asks for (the game connection's frames, frames with a known
/// item, the game's other connections) goes to a text file in Downloads, with the player's marks, to find new records.
/// `items` = item code → name. Stops by itself after 15 minutes or 200 MB.
#[tauri::command]
pub fn recorder_start(
    app: AppHandle,
    kinds: Option<aion2_meter::recorder::Kinds>,
    items: Option<std::collections::HashMap<u32, String>>,
) -> Result<aion2_meter::recorder::RecorderStatus, String> {
    let dir = app.path().download_dir().or_else(|_| app.path().app_data_dir()).map_err(|e| e.to_string())?;
    aion2_meter::recorder::start_with(&dir, kinds.unwrap_or_default(), items.unwrap_or_default())
        .map_err(|e| format!("Could not create the recording file: {e}"))?;
    Ok(aion2_meter::recorder::status())
}

#[tauri::command]
pub fn recorder_mark(label: String) -> aion2_meter::recorder::RecorderStatus {
    aion2_meter::recorder::mark(&label);
    aion2_meter::recorder::status()
}

#[tauri::command]
pub fn recorder_stop() -> aion2_meter::recorder::RecorderStatus {
    aion2_meter::recorder::stop()
}

#[tauri::command]
pub fn recorder_status() -> aion2_meter::recorder::RecorderStatus {
    aion2_meter::recorder::status()
}

/// The "hidden cube nearby" popup on or off, and its size (`scale`, 0.6..2, 1 = 260 × 96): it shows
/// while a cube is in view and for a few seconds after one is opened.
#[tauri::command]
pub async fn cube_popup(app: AppHandle, show: bool, scale: Option<f64>) -> Result<(), String> {
    let scale = scale.unwrap_or(1.0).clamp(0.6, 2.0);
    if let Ok(mut a) = app.state::<MeterState>().auto.lock() {
        a.cube = show;
        a.cube_scale = scale;
    }
    match app.get_webview_window(CUBE) {
        Some(w) if show => {
            let _ = w.set_size(tauri::LogicalSize::new(CUBE_SIZE.0 * scale, CUBE_SIZE.1 * scale));
        }
        Some(_) => close(&app, CUBE),
        None => {}
    }
    Ok(())
}

/// The radar on or off: cubes around you, north up, to lay over the game's minimap; on screen only while a cube is
/// in view or was just opened (as the cube popup).
#[tauri::command]
pub async fn radar_overlay(app: AppHandle, show: bool) -> Result<(), String> {
    if let Ok(mut a) = app.state::<MeterState>().auto.lock() {
        a.radar = show;
    }
    if !show {
        close(&app, RADAR);
    }
    Ok(())
}

/// The small ping and packet loss overlay on or off (it hides with the others while another window is in front).
#[tauri::command]
pub async fn net_overlay(app: AppHandle, show: bool) -> Result<(), String> {
    if let Ok(mut a) = app.state::<MeterState>().auto.lock() {
        a.net = show;
    }
    // The main window saves the switch, also when it is turned off from the overlay itself.
    let _ = app.emit("net-overlay", show);
    if !show {
        close(&app, NET);
    }
    Ok(())
}

/// The soul points popup: `on` = the switch (Settings), `scale` = its size; `pop` = the app's combo
/// (`domain/soul-pop.ts` `SoulPop`), shown until `until_ms` (wall clock, ms). The window is made hidden as soon as the
/// switch is on, so it is loaded when the first gain comes (made then, it showed for a moment only); a window made
/// later asks for the last pop with `souls_popup_state`, the others come as `souls-pop` events.
#[tauri::command]
pub async fn souls_popup(app: AppHandle, on: bool, pop: Option<serde_json::Value>, until_ms: Option<i64>, scale: Option<f64>) -> Result<(), String> {
    let scale = scale.map(|k| k.clamp(0.5, 2.0));
    if let Ok(mut a) = app.state::<MeterState>().auto.lock() {
        a.souls = on;
        if let Some(k) = scale {
            a.souls_scale = k;
        }
        if let (Some(p), Some(t)) = (&pop, until_ms) {
            a.souls_pop = Some(p.clone());
            a.souls_until = t;
        }
    }
    if let Some(p) = pop {
        let _ = app.emit("souls-pop", p);
    }
    match app.get_webview_window(SOULS) {
        _ if !on => close(&app, SOULS),
        Some(w) => {
            if let Some(k) = scale {
                let _ = w.set_size(tauri::LogicalSize::new(SOULS_SIZE.0 * k, SOULS_SIZE.1 * k));
            }
        }
        None => {
            if let Err(e) = build(&app, SOULS) {
                eprintln!("souls popup: {e}");
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn souls_popup_state(app: AppHandle) -> Option<serde_json::Value> {
    app.state::<MeterState>().auto.lock().ok()?.souls_pop.clone()
}

/// The cube codes learned in earlier sessions (saved by the app), so cubes are known at once.
#[tauri::command]
pub fn meter_cube_codes(codes: Vec<u32>) {
    aion2_meter::cubes::set_codes(&codes);
}

/// The Crafting page's item codes: their pieces in the inventory come with the wallet (`currencies.rs`).
#[tauri::command]
pub fn meter_item_codes(codes: Vec<u32>) {
    aion2_meter::currencies::set_item_codes(&codes);
}

/// "Edit overlays" on or off. On: every overlay that is on shows with a frame (`hud-edit` event) and the panel
/// opens in the middle of the screen; where they are now is kept for `hud_cancel`. Off: the panel closes, the
/// overlays go back to showing only when they have something to say; their places stay as they were moved.
#[tauri::command]
pub async fn hud_edit(app: AppHandle, on: bool) -> Result<(), String> {
    let from = if on { crate::places::now(&app, &OVERLAYS) } else { Vec::new() };
    if let Ok(mut a) = app.state::<MeterState>().auto.lock() {
        if on && !a.edit {
            a.edit_from = from;
        }
        a.edit = on;
    }
    let _ = app.emit("hud-edit", on);
    match app.get_webview_window(HUD) {
        Some(w) if on => {
            let _ = w.show();
            let _ = w.set_focus();
        }
        Some(_) => close(&app, HUD),
        None if on => build(&app, HUD)?,
        None => {}
    }
    Ok(())
}

/// Whether "Edit overlays" is open (for an overlay window as it opens).
#[tauri::command]
pub fn hud_edit_state(app: AppHandle) -> bool {
    app.state::<MeterState>().auto.lock().map(|a| a.edit).unwrap_or(false)
}

/// Cancel: the overlays back where they were when editing began, then editing ends.
#[tauri::command]
pub async fn hud_cancel(app: AppHandle) -> Result<(), String> {
    let from = app.state::<MeterState>().auto.lock().map(|a| a.edit_from.clone()).unwrap_or_default();
    crate::places::put(&app, &from);
    hud_edit(app, false).await
}

/// Where each overlay is now (physical pixels; size only for the ones the player sizes by hand).
#[tauri::command]
pub fn overlay_places(app: AppHandle) -> Vec<(String, crate::places::Place)> {
    crate::places::now(&app, &OVERLAYS)
}

/// Moves (and sizes) the overlays to a preset's places, open or not.
#[tauri::command]
pub fn overlay_set_places(app: AppHandle, places: Vec<(String, crate::places::Place)>) {
    let places: Vec<_> = places.into_iter().filter(|(l, _)| OVERLAYS.contains(&l.as_str())).collect();
    crate::places::put(&app, &places);
}

fn close(app: &AppHandle, label: &str) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.close();
    }
}

fn set_visible(app: &AppHandle, label: &str, on: bool) {
    match (app.get_webview_window(label), on) {
        (Some(w), true) => {
            if !w.is_visible().unwrap_or(false) {
                let _ = w.show();
            }
        }
        (Some(w), false) => {
            let _ = w.hide();
        }
        (None, true) => {
            if let Err(e) = build(app, label) {
                eprintln!("{label} overlay: {e}");
            } else if label == SOULS {
                if let Some(w) = app.get_webview_window(label) {
                    let _ = w.show();
                }
            }
        }
        (None, false) => {}
    }
}

/// Overlays whose size the player sets by dragging their corner (remembered with their spot): the cube and
/// soul points popups take theirs from Settings, the events overlay's height follows its list.
pub fn sized_by_hand(label: &str) -> crate::places::Sizing {
    use crate::places::Sizing;
    match label {
        OVERLAY | RADAR | NET => Sizing::Both,
        EVENTS => Sizing::Width,
        _ => Sizing::None,
    }
}

/// A borderless, transparent, always-on-top window that never takes the focus from the game.
/// Over the game it needs borderless/windowed fullscreen.
fn build(app: &AppHandle, label: &str) -> Result<(), String> {
    if label == HUD {
        let mut b = WebviewWindowBuilder::new(app, HUD, WebviewUrl::App("index.html#hud".into()));
        let (w, h) = (380.0, 560.0);
        if let Ok(Some(m)) = app.primary_monitor() {
            let size = m.size().to_logical::<f64>(m.scale_factor());
            let at = m.position().to_logical::<f64>(m.scale_factor());
            b = b.position(at.x + (size.width - w) / 2.0, at.y + (size.height - h) / 2.0);
        }
        return b
            .title("AION 2 Companion – Edit overlays")
            .inner_size(w, h)
            .min_inner_size(320.0, 360.0)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(false)
            .resizable(true)
            .build()
            .map(|_| ())
            .map_err(|e| e.to_string());
    }
    let (title, w, h, min_w, min_h) = if label == EVENTS {
        ("AION 2 Companion – Events", 300.0, 230.0, 200.0, 80.0)
    } else if label == NET {
        ("AION 2 Companion – Network", 150.0, 34.0, 110.0, 28.0)
    } else if label == RADAR {
        ("AION 2 Companion – Radar", 220.0, 220.0, 120.0, 120.0)
    } else if label == SOULS {
        let k = app.state::<MeterState>().auto.lock().map(|a| a.souls_scale).unwrap_or(1.0);
        ("AION 2 Companion – Soul points", SOULS_SIZE.0 * k, SOULS_SIZE.1 * k, 110.0, 42.0)
    } else if label == CUBE {
        let k = app.state::<MeterState>().auto.lock().map(|a| a.cube_scale).unwrap_or(1.0);
        ("AION 2 Companion – Hidden cube", CUBE_SIZE.0 * k, CUBE_SIZE.1 * k, 150.0, 55.0)
    } else {
        ("AION 2 Companion – DPS", 340.0, 260.0, 240.0, 120.0)
    };
    let mut b = WebviewWindowBuilder::new(app, label, WebviewUrl::App(format!("index.html#{label}").into()));
    // The cube popup starts at the top centre of the main screen (the player can drag it away).
    // The soul points popup a third of the way down, centred.
    if let (true, Ok(Some(m))) = (label == CUBE || label == SOULS, app.primary_monitor()) {
        let size = m.size().to_logical::<f64>(m.scale_factor());
        let at = m.position().to_logical::<f64>(m.scale_factor());
        let y = if label == SOULS { size.height * 0.3 } else { 48.0 };
        b = b.position(at.x + (size.width - w) / 2.0, at.y + y);
    }
    b.title(title)
        .inner_size(w, h)
        .min_inner_size(min_w, min_h)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .focusable(false)
        .visible(label != SOULS) // made hidden ahead of its first gain (`souls_popup`)
        .resizable(true)
        .build()
        .map(|w| crate::places::follow(app, label, &w, sized_by_hand(label)))
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn auto(idle: u64) -> Auto {
        Auto {
            overlay: true,
            wanted: false,
            events: false,
            cube: false,
            cube_near: false,
            cube_scale: 1.0,
            radar: false,
            net: false,
            souls: false,
            souls_until: 0,
            souls_near: false,
            souls_pop: None,
            souls_scale: 1.0,
            follow_game: true,
            front: true,
            opacity: 90,
            idle: Duration::from_secs(idle),
            last_active: Instant::now(),
            last_total: 0.0,
            edit: false,
            edit_from: Vec::new(),
        }
    }

    #[test]
    fn overlays_hide_when_the_game_is_not_in_front() {
        let mut a = auto(15);
        a.wanted = true;
        a.events = true;
        let v = |dps, events, cube, radar| Visible { dps, events, cube, radar, net: false, souls: false };
        a.cube = true;
        a.radar = true;
        assert_eq!(a.visible(), v(true, true, false, false), "the cube popup and the radar wait for a cube");
        a.cube_near = true;
        assert_eq!(a.visible(), v(true, true, true, true));
        a.front = false;
        assert_eq!(a.visible(), v(false, false, false, false));
        a.follow_game = false;
        assert_eq!(a.visible(), v(true, true, true, true));
        a.wanted = false; // idle or hidden by hand
        assert_eq!(a.visible(), v(false, true, true, true));
        a.overlay = false;
        a.wanted = true;
        a.cube = false;
        assert_eq!(a.visible(), v(false, true, false, true), "the radar shows with a cube even with the popup off");
        a.radar = false;
        assert_eq!(a.visible(), v(false, true, false, false));
    }

    #[test]
    fn the_soul_points_popup_shows_while_a_combo_is_on() {
        let mut a = auto(15);
        a.overlay = false;
        a.souls = true;
        assert!(!a.visible().souls, "nothing gained yet");
        a.souls_near = true;
        assert!(a.visible().souls);
        a.front = false;
        assert!(!a.visible().souls, "hidden with the others behind another window");
    }

    #[test]
    fn the_cube_popup_stays_up_a_few_seconds_after_an_opening() {
        use aion2_meter::cubes::{Cube, Cubes, Opened};
        let mut c = Cubes::default();
        assert!(!cube_news(&c, 10_000));
        c.live.push(Cube { entity: 1, code: 1, x: 0.0, y: 0.0, z: 0.0, seen_ms: 0 });
        assert!(cube_news(&c, 10_000));
        c.live.clear();
        c.opened.push(Opened { code: None, x: 0.0, y: 0.0, z: 0.0, by_you: false, at_ms: 10_000 });
        assert!(cube_news(&c, 14_999));
        assert!(!cube_news(&c, 15_000));
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
