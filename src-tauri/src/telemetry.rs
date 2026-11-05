// Sentry for the Rust side, only when the player turned crash reports on (settings.crashReports in the save
// file, read at startup: a change applies at the next start). Panics (crash.log keeps working as before),
// and the meter's `tracing` output: errors as events, warnings and errors as logs, info as breadcrumbs.
// The frontend reports on its own (src/infra/sentry.ts).
use tauri::{AppHandle, Manager};
use tracing_subscriber::{filter::LevelFilter, layer::SubscriberExt, util::SubscriberInitExt, Layer};

/// Same as SENTRY_DSN in src/config.ts.
const DSN: &str = "https://0afd49e981b62ffdc003ce13d30dc2be@o4512380557328384.ingest.de.sentry.io/4512380746661968";

/// Keeps the client alive (and flushes it on exit).
pub struct Guard(#[allow(dead_code)] sentry::ClientInitGuard);

pub fn start(app: &AppHandle) {
    if !enabled(app) {
        return;
    }
    let mut options = sentry::ClientOptions::default();
    options.release = Some(app.package_info().version.to_string().into());
    options.environment = Some(if cfg!(debug_assertions) { "development" } else { "production" }.into());
    options.send_default_pii = false;
    let guard = sentry::init((DSN, options));
    use sentry::integrations::tracing::{BreadcrumbLayer, ErrorLayer, LogLayer};
    let _ = tracing_subscriber::registry()
        .with(ErrorLayer::new().with_filter(LevelFilter::ERROR))
        .with(LogLayer::new().with_filter(LevelFilter::WARN))
        .with(BreadcrumbLayer::new().with_filter(LevelFilter::INFO))
        .try_init();
    app.manage(Guard(guard));
}

/// settings.crashReports in data.json (plugin-store: `{ "data": AppData }` in the app data folder).
fn enabled(app: &AppHandle) -> bool {
    let Ok(dir) = app.path().app_data_dir() else { return false };
    let Ok(bytes) = std::fs::read(dir.join("data.json")) else { return false };
    serde_json::from_slice::<serde_json::Value>(&bytes)
        .is_ok_and(|v| v["data"]["settings"]["crashReports"] == true)
}
