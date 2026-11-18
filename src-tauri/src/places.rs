// Where the player left each overlay window (DPS, events, cube popup, radar) and the main window (its screen,
// spot, size, maximized): remembered when it is moved and used the next time it opens, if that spot is still on a screen. Saved in the app's
// config folder (overlay-positions.json), physical pixels.
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent};

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

/// Gives the main window the screen, spot and size the player left it at (maximized again if it was),
/// and remembers them from now on (under `<label>:pos`, `<label>:size` and `<label>:max`, in the same file).
/// Spot and size are not taken while maximized or minimized (a minimized window is 0 × 0, far off screen).
/// A spot no screen shows any more (a monitor unplugged) is left to the system; the size still applies.
pub fn keep_place(app: &AppHandle, label: &str, w: &WebviewWindow) {
    let (pos_key, size_key, max_key) = (format!("{label}:pos"), format!("{label}:size"), format!("{label}:max"));
    let (pos, size, max) = with(|p| (p.at.get(&pos_key).copied(), p.at.get(&size_key).copied(), p.at.get(&max_key).copied()));
    // The spot first: the window is then on its screen, and the size (physical pixels) is that screen's.
    if let Some(at) = pos.filter(|&at| on_a_screen(app, at)) {
        let _ = w.set_position(PhysicalPosition::new(at.0, at.1));
    }
    if let Some((width, height)) = size.filter(|&(w, h)| w >= 400 && h >= 300) {
        let _ = w.set_size(PhysicalSize::new(width as u32, height as u32));
    }
    if max == Some((1, 0)) {
        let _ = w.maximize();
    }
    let win = w.clone();
    let remember = move |key: &String, v: (i32, i32)| {
        with(|p| {
            if p.at.get(key) != Some(&v) {
                p.at.insert(key.clone(), v);
                p.dirty = true;
            }
        })
    };
    w.on_window_event(move |e| {
        // Asked before taking the lock: never a window call while holding it.
        let (maxed, mini) = (win.is_maximized().unwrap_or(false), win.is_minimized().unwrap_or(false));
        match e {
            WindowEvent::Resized(s) if !mini && s.width > 0 => {
                remember(&max_key, (maxed as i32, 0));
                if !maxed {
                    remember(&size_key, (s.width as i32, s.height as i32));
                }
            }
            WindowEvent::Moved(p) if !mini && !maxed => remember(&pos_key, (p.x, p.y)),
            _ => {}
        }
    });
}

/// Writes the places every 2 s while something moved, so a PC shut down with the app open keeps them
/// (the meter's update thread also flushes; it may not run without a capture).
pub fn autosave() {
    std::thread::spawn(|| loop {
        std::thread::sleep(std::time::Duration::from_secs(2));
        flush();
    });
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
