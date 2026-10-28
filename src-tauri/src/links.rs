//! Links to websites (shugo.gg profiles, news, Npcap) in the player's own browser. The webview opens no new window
//! for a `target="_blank"` link, so those links did nothing in the desktop app (2026-10-28). No shell is involved:
//! the URL is one argument to the system's URL handler, and only a plain http(s) URL is accepted.

use std::process::Command;

fn plain_url(url: &str) -> bool {
    (url.starts_with("https://") || url.starts_with("http://"))
        && url.len() <= 2048
        && !url.chars().any(|c| c.is_whitespace() || c.is_control() || matches!(c, '"' | '\'' | '<' | '>' | '`' | '^' | '|'))
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !plain_url(&url) {
        return Err("not a web link".into());
    }
    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("rundll32");
        c.arg("url.dll,FileProtocolHandler").arg(&url);
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        c.arg(&url);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = Command::new("xdg-open");
        c.arg(&url);
        c
    };
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::plain_url;

    #[test]
    fn only_plain_web_links() {
        assert!(plain_url("https://shugo.gg/aion2/character/eu/2315/aesN"));
        assert!(plain_url("https://npcap.com/#download"));
        assert!(!plain_url("file:///C:/Windows/System32/calc.exe"));
        assert!(!plain_url("https://a.b/x\" & calc"));
        assert!(!plain_url("https://a.b/x y"));
        assert!(!plain_url("javascript:alert(1)"));
    }
}
