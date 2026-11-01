//! The official character search and profiles (src/infra/armory.ts), read from here rather than through the HTTP plugin:
//! the plugin adds the webview's `Origin` (http://tauri.localhost) to every request, and the search answers that with 403
//! (checked by the player with curl, 2026-11-01: 200 without an Origin, 403 with the app's). This sends none, as any
//! program does, and names the app in its User-Agent. Only the site's character endpoints are reachable.

use std::sync::OnceLock;
use std::time::Duration;
use tauri_plugin_http::reqwest;

const ALLOWED: [&str; 2] = ["https://api-search.plaync.com/aion2global/search/", "https://aion2.plaync.com/api/character/"];

fn allowed(url: &str) -> bool {
    ALLOWED.iter().any(|p| url.starts_with(p)) && url.len() <= 2048 && !url.chars().any(|c| c.is_whitespace() || c.is_control())
}

fn client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(c) = CLIENT.get() {
        return Ok(c);
    }
    let c = reqwest::Client::builder()
        .user_agent(concat!("AION2-Companion/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    Ok(CLIENT.get_or_init(|| c))
}

#[derive(serde::Serialize)]
pub struct Answer {
    status: u16,
    json: bool, // the site answers errors with an HTML page and status 200
    body: String,
}

#[tauri::command]
pub async fn armory_get(url: String) -> Result<Answer, String> {
    if !allowed(&url) {
        return Err("not an official character address".into());
    }
    let res = client()?.get(&url).header("Accept", "application/json").send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let json = res.headers().get("content-type").and_then(|v| v.to_str().ok()).is_some_and(|t| t.contains("json"));
    let body = res.text().await.map_err(|e| e.to_string())?;
    Ok(Answer { status, json, body })
}

#[cfg(test)]
mod tests {
    use super::allowed;

    #[test]
    fn only_the_character_endpoints() {
        assert!(allowed("https://api-search.plaync.com/aion2global/search/v2/character?keyword=a&serverId=2318"));
        assert!(allowed("https://aion2.plaync.com/api/character/info?region=eu&characterId=x%3D&serverId=2318"));
        assert!(!allowed("https://aion2.plaync.com/api/account"));
        assert!(!allowed("https://evil.example/https://aion2.plaync.com/api/character/"));
        assert!(!allowed("https://aion2.plaync.com/api/character/info?a=1 b"));
    }
}
