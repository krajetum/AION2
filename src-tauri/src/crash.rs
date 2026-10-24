// The crash log: a panic anywhere in the app is written to crash.log in the app's log folder
// (version, time, thread, message, backtrace) before the app goes down, and Settings > Diagnostics
// shows it. Hangs ("not responding") are not panics: Windows' Event Viewer has those.
use std::io::Write;
use std::path::PathBuf;
use std::sync::OnceLock;

use serde::Serialize;
use tauri::{AppHandle, Manager};

static FILE: OnceLock<PathBuf> = OnceLock::new();
/// Kept to the last this many bytes when it grows past twice that.
const KEEP: usize = 64 * 1024;

pub fn install(app: &AppHandle) {
    let Ok(dir) = app.path().app_log_dir() else { return };
    let _ = FILE.set(dir.join("crash.log"));
    let version = app.package_info().version.to_string();
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Some(file) = FILE.get() {
            let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            let thread = std::thread::current().name().unwrap_or("unnamed").to_string();
            let trace = std::backtrace::Backtrace::force_capture();
            let entry = format!("=== AION 2 Companion {version} · unix {secs} · thread {thread}\n{info}\n{trace}\n\n");
            if let Some(dir) = file.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(file) {
                let _ = f.write_all(entry.as_bytes());
            }
            trim(file);
        }
        previous(info);
    }));
}

fn trim(file: &PathBuf) {
    if let Ok(text) = std::fs::read(file) {
        if text.len() > 2 * KEEP {
            let _ = std::fs::write(file, &text[text.len() - KEEP..]);
        }
    }
}

#[derive(Serialize)]
pub struct CrashLog {
    pub path: Option<String>,
    /// The end of the log, empty when nothing crashed.
    pub text: String,
}

#[tauri::command]
pub fn crash_log() -> CrashLog {
    let path = FILE.get();
    let text = path.and_then(|p| std::fs::read(p).ok()).map(|b| {
        let tail = &b[b.len().saturating_sub(8 * 1024)..];
        String::from_utf8_lossy(tail).into_owned()
    });
    CrashLog { path: path.map(|p| p.display().to_string()), text: text.unwrap_or_default() }
}
