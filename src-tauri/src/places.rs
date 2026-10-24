// Where the player left each overlay window (DPS, events, cube popup, radar): remembered when it is
// moved and used the next time it opens, if that spot is still on a screen. Saved in the app's
// config folder (overlay-positions.json), physical pixels.
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, PhysicalPosition, WebviewWindow, WindowEvent};

#[derive(Default)]
struct Places {
    file: Option<PathBuf>,
    at: HashMap<String, (i32, i32)>,
    dirty: bool,
}

static PLACES: Mutex<Option<Places>> = Mutex::new(None);

fn with<T>(f: impl FnOnce(&mut Places) -> T) -> T {
    let mut g = PLACES.lock().unwrap_or_else(|e| e.into_inner());
    f(g.get_or_insert_with(Places::default))
}

/// Reads the saved positions (app start).
pub fn load(app: &AppHandle) {
    let file = app.path().app_config_dir().ok().map(|d| d.join("overlay-positions.json"));
    let at = file
        .as_ref()
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    with(|p| {
        p.file = file;
        p.at = at;
    });
}

/// Writes them if something moved since the last call (the meter's update thread calls it).
pub fn flush() {
    let (file, json) = match with(|p| {
        if !p.dirty {
            return None;
        }
        p.dirty = false;
        Some((p.file.clone()?, serde_json::to_string(&p.at).ok()?))
    }) {
        Some(x) => x,
        None => return,
    };
    if let Some(dir) = file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Err(e) = std::fs::write(&file, json) {
        eprintln!("overlay positions: {e}");
    }
}

fn on_a_screen(app: &AppHandle, (x, y): (i32, i32)) -> bool {
    app.available_monitors().unwrap_or_default().iter().any(|m| {
        let (p, s) = (m.position(), m.size());
        // The window's top-left corner, with some room for its title row.
        x >= p.x - 40 && y >= p.y - 10 && x < p.x + s.width as i32 - 40 && y < p.y + s.height as i32 - 40
    })
}

/// Puts a new overlay window where it was left, and remembers where it goes from now on.
pub fn follow(app: &AppHandle, label: &str, w: &WebviewWindow) {
    if let Some(at) = with(|p| p.at.get(label).copied()).filter(|&at| on_a_screen(app, at)) {
        let _ = w.set_position(PhysicalPosition::new(at.0, at.1));
    }
    let label = label.to_string();
    w.on_window_event(move |e| {
        if let WindowEvent::Moved(p) = e {
            with(|s| {
                if s.at.get(&label) != Some(&(p.x, p.y)) {
                    s.at.insert(label.clone(), (p.x, p.y));
                    s.dirty = true;
                }
            });
        }
    });
}
