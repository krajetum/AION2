// The beta update channel (`settings.betaUpdates`). The updater's JS API can't change the endpoint, so this checks
// the beta manifest here and hands the update to the JS `Update` class (src/infra/system.ts) through the same
// resource table the plugin's own `check` uses, so its downloadAndInstall works unchanged.
// latest-beta.json (release `beta-channel`) is rewritten by every build, beta or stable (.github/workflows/release.yml),
// so it always names the newest of the two; the stable manifest is only the fallback while it doesn't exist yet.
use serde::Serialize;
use tauri::{Manager, Runtime, Url, Webview};
use tauri_plugin_updater::UpdaterExt;

const ENDPOINTS: [&str; 2] = [
    "https://github.com/krajetum/AION2/releases/download/beta-channel/latest-beta.json",
    "https://github.com/krajetum/AION2/releases/latest/download/latest.json",
];

/// The shape of the plugin's own `check` answer (what `new Update(...)` takes).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    rid: u32,
    current_version: String,
    version: String,
    body: Option<String>,
    raw_json: serde_json::Value,
}

#[tauri::command]
pub async fn update_check_beta<R: Runtime>(webview: Webview<R>) -> Result<Option<Found>, String> {
    let urls = ENDPOINTS.iter().map(|u| Url::parse(u).unwrap()).collect();
    let updater = webview.updater_builder().endpoints(urls).and_then(|b| b.build()).map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else { return Ok(None) };
    Ok(Some(Found {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        body: update.body.clone(),
        raw_json: update.raw_json.clone(),
        rid: webview.resources_table().add(update),
    }))
}
