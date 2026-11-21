// A local MCP server ("Streamable HTTP", plain JSON replies, no SSE) so Claude can read the DPS Log while the app is open:
// http://127.0.0.1:47821/mcp, only while settings.mcpServer is on (`mcp_server`, from main.ts and Settings).
// Reads fights.json (src/infra/fights.ts) on each call, so it has the last saved fight and needs nothing from the webview.
use serde_json::{json, Map, Value};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub const ADDR: &str = "127.0.0.1:47821";
static ON: AtomicBool = AtomicBool::new(false);
static STARTED: OnceLock<Result<(), String>> = OnceLock::new();

/// Turns the server on or off. The listener starts the first time it is turned on; while off it answers 503.
#[tauri::command]
pub fn mcp_server(app: AppHandle, on: bool) -> Result<(), String> {
    ON.store(on, Ordering::Relaxed);
    if !on {
        return Ok(());
    }
    STARTED.get_or_init(|| {
        let listener = TcpListener::bind(ADDR).map_err(|e| format!("{ADDR}: {e}"))?;
        let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join("fights.json");
        let version = app.package_info().version.to_string();
        std::thread::spawn(move || {
            // ponytail: one connection at a time; a thread per connection if several clients ever wait on each other.
            for stream in listener.incoming().flatten() {
                let _ = serve(stream, &path, &version);
            }
        });
        Ok(())
    })
    .clone()
}

fn serve(mut stream: TcpStream, path: &PathBuf, version: &str) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut line = String::new();
    reader.read_line(&mut line)?;
    let (method, target) = {
        let mut p = line.split_whitespace();
        (p.next().unwrap_or("").to_string(), p.next().unwrap_or("").to_string())
    };
    let (mut len, mut origin) = (0usize, None);
    loop {
        let mut h = String::new();
        if reader.read_line(&mut h)? == 0 || h.trim().is_empty() {
            break;
        }
        if let Some((k, v)) = h.split_once(':') {
            match k.trim().to_ascii_lowercase().as_str() {
                "content-length" => len = v.trim().parse().unwrap_or(0).min(1 << 20),
                "origin" => origin = Some(v.trim().to_string()),
                _ => {}
            }
        }
    }
    let mut body = vec![0; len];
    reader.read_exact(&mut body)?;

    let (status, reply) = if !origin.as_deref().map_or(true, local_origin) {
        ("403 Forbidden", None)
    } else if target.split('?').next() != Some("/mcp") {
        ("404 Not Found", None)
    } else if method != "POST" {
        ("405 Method Not Allowed", None)
    } else if !ON.load(Ordering::Relaxed) {
        ("503 Service Unavailable", None)
    } else {
        match serde_json::from_slice::<Value>(&body) {
            Err(e) => ("200 OK", Some(error(Value::Null, -32700, &e.to_string()))),
            Ok(req) => match handle(&req, || read_fights(path), version) {
                Some(r) => ("200 OK", Some(r)),
                None => ("202 Accepted", None), // a notification
            },
        }
    };
    let body = reply.map(|r| r.to_string()).unwrap_or_default();
    write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

/// The MCP spec's DNS-rebinding rule: a browser page may only call it from localhost.
fn local_origin(o: &str) -> bool {
    let host = o.split("://").nth(1).unwrap_or("");
    let host = if host.starts_with('[') { host.split(']').next().map(|h| &h[1..]).unwrap_or("") } else { host.split([':', '/']).next().unwrap_or("") };
    matches!(host, "localhost" | "127.0.0.1" | "::1")
}

fn read_fights(path: &PathBuf) -> Vec<Value> {
    std::fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .and_then(|v| v["fights"].as_array().cloned())
        .unwrap_or_default()
}

fn error(id: Value, code: i32, msg: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": msg } })
}

/// One JSON-RPC request → its reply (None for a notification).
fn handle(req: &Value, fights: impl Fn() -> Vec<Value>, version: &str) -> Option<Value> {
    let id = req.get("id")?.clone();
    let params = &req["params"];
    let result = match req["method"].as_str().unwrap_or("") {
        "initialize" => json!({
            "protocolVersion": params["protocolVersion"].as_str().unwrap_or("2025-06-18"),
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "aion2-companion", "version": version },
            "instructions": "AION 2 Companion's DPS Log: boss fights the player's passive DPS meter recorded (newest first). \
                Use list_fights to find a fight, get_fight for its players (damage, DPS, share %, healing, damage taken, deaths with \
                times in ms from the first hit, the player's own skills). Rows named \"Others\" are everyone outside the party.",
        }),
        "ping" => json!({}),
        "tools/list" => json!({ "tools": tools() }),
        "tools/call" => {
            let args = &params["arguments"];
            let text = match params["name"].as_str().unwrap_or("") {
                "list_fights" => list_fights(&fights(), args),
                "get_fight" => match fights().iter().find(|f| f["id"] == args["id"]) {
                    Some(f) => get_fight(f),
                    None => return Some(json!({ "jsonrpc": "2.0", "id": id, "result": {
                        "content": [{ "type": "text", "text": "No fight with that id: call list_fights." }], "isError": true } })),
                },
                n => return Some(error(id, -32602, &format!("unknown tool {n}"))),
            };
            json!({ "content": [{ "type": "text", "text": text.to_string() }] })
        }
        m => return Some(error(id, -32601, &format!("method not found: {m}"))),
    };
    Some(json!({ "jsonrpc": "2.0", "id": id, "result": result }))
}

fn tools() -> Value {
    json!([
        {
            "name": "list_fights",
            "description": "The DPS Log's boss fights, newest first: id, end time (UTC), boss, length, killed, the character played, their DPS, rows.",
            "inputSchema": { "type": "object", "properties": {
                "boss": { "type": "string", "description": "Part of the boss's name (any case)" },
                "char": { "type": "string", "description": "Part of the played character's name (any case)" },
                "limit": { "type": "integer", "description": "At most this many (default 20, max 100)" },
            } },
        },
        {
            "name": "get_fight",
            "description": "One fight with every player row (biggest damage first): name, class, damage, DPS, share %, healing, damage taken, deaths and revive times, hits, crit rate, skills.",
            "inputSchema": { "type": "object", "properties": { "id": { "type": "string", "description": "From list_fights" } }, "required": ["id"] },
        },
    ])
}

fn secs(f: &Value) -> f64 {
    (f["battleTimeMs"].as_f64().unwrap_or(0.0) / 1000.0).max(1.0)
}

fn contains(v: &Value, needle: &Value) -> bool {
    needle.as_str().map_or(true, |n| v.as_str().unwrap_or("").to_lowercase().contains(&n.to_lowercase()))
}

fn list_fights(fights: &[Value], args: &Value) -> Value {
    let limit = args["limit"].as_u64().unwrap_or(20).clamp(1, 100) as usize;
    let rows: Vec<Value> = fights
        .iter()
        .filter(|f| contains(&f["boss"], &args["boss"]) && contains(&f["char"], &args["char"]))
        .take(limit)
        .map(|f| {
            let rows = f["rows"].as_array().map(Vec::as_slice).unwrap_or_default();
            let you = rows.iter().find(|r| r["isYou"] == true);
            json!({
                "id": f["id"], "end": utc(f["endMs"].as_i64().unwrap_or(0)), "boss": f["boss"],
                "durationS": (secs(f)).round(), "killed": f["killed"], "char": f["char"], "mapId": f["mapId"],
                "yourDps": you.map(|r| (r["damage"].as_f64().unwrap_or(0.0) / secs(f)).round()), "rows": rows.len(),
            })
        })
        .collect();
    Value::Array(rows)
}

fn get_fight(f: &Value) -> Value {
    let s = secs(f);
    let mut out: Map<String, Value> = f.as_object().cloned().unwrap_or_default();
    for k in ["timeline", "series", "hp"] {
        out.remove(k);
    }
    out.insert("end".into(), json!(utc(f["endMs"].as_i64().unwrap_or(0))));
    let mut rows: Vec<Value> = f["rows"].as_array().cloned().unwrap_or_default();
    for r in &mut rows {
        let (d, h) = (r["damage"].as_f64().unwrap_or(0.0), r["heal"].as_f64().unwrap_or(0.0));
        r["dps"] = json!((d / s).round());
        r["hps"] = json!((h / s).round());
        for k in ["skills", "healSkills", "buffs"] {
            if let Some(list) = r[k].as_array_mut() {
                list.iter_mut().filter_map(Value::as_object_mut).for_each(|x| { x.remove("icon"); });
            }
        }
    }
    rows.sort_by(|a, b| b["damage"].as_f64().unwrap_or(0.0).total_cmp(&a["damage"].as_f64().unwrap_or(0.0)));
    out.insert("rows".into(), Value::Array(rows));
    Value::Object(out)
}

/// Epoch ms → "2026-11-21T20:15:03Z" (Howard Hinnant's civil_from_days).
fn utc(ms: i64) -> String {
    let (days, rem) = (ms.div_euclid(86_400_000), ms.rem_euclid(86_400_000) / 1000);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", rem / 3600, rem / 60 % 60, rem % 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fights() -> Vec<Value> {
        let row = |name: &str, you: bool, damage: f64| json!({ "id": 1, "name": name, "isYou": you, "damage": damage, "heal": 0,
            "skills": [{ "name": "Slash", "icon": "x", "damage": damage }], "healSkills": [],
            "buffs": [{ "name": "Courage Scroll", "icon": "y", "upMs": 1000 }] });
        vec![
            json!({ "id": "b", "endMs": 1_763_756_103_000i64, "battleTimeMs": 100_000, "boss": "Gartua", "char": "Me", "killed": true,
                "rows": [row("Me", true, 1_000_000.0), row("Them", false, 3_000_000.0)], "series": {}, "timeline": [1] }),
            json!({ "id": "a", "endMs": 0, "battleTimeMs": 500, "boss": "Ludra", "char": "Alt", "killed": false, "rows": [] }),
        ]
    }
    fn call(name: &str, args: Value) -> Value {
        let r = handle(&json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": name, "arguments": args } }), fights, "1").unwrap();
        serde_json::from_str(r["result"]["content"][0]["text"].as_str().unwrap_or("null")).unwrap_or(r)
    }

    #[test]
    fn lists_tools_and_skips_notifications() {
        let r = handle(&json!({ "jsonrpc": "2.0", "id": 7, "method": "tools/list" }), fights, "1").unwrap();
        assert_eq!(r["id"], 7);
        assert_eq!(r["result"]["tools"].as_array().unwrap().len(), 2);
        assert!(handle(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }), fights, "1").is_none());
    }

    #[test]
    fn list_filters_limits_and_computes_your_dps() {
        let all = call("list_fights", json!({}));
        assert_eq!(all.as_array().unwrap().len(), 2);
        assert_eq!((all[0]["yourDps"].as_f64(), all[0]["end"].as_str()), (Some(10_000.0), Some("2025-11-21T20:15:03Z")));
        assert_eq!(all[1]["yourDps"], Value::Null);
        assert_eq!(call("list_fights", json!({ "boss": "lud" }))[0]["id"], "a");
        assert_eq!(call("list_fights", json!({ "char": "ME", "limit": 1 })).as_array().unwrap().len(), 1);
    }

    #[test]
    fn get_fight_sorts_rows_recomputes_dps_and_drops_bulk() {
        let f = call("get_fight", json!({ "id": "b" }));
        assert_eq!((f["rows"][0]["name"].as_str(), f["rows"][0]["dps"].as_f64()), (Some("Them"), Some(30_000.0)));
        assert!(f.get("series").is_none() && f.get("timeline").is_none() && f["rows"][0]["skills"][0].get("icon").is_none());
        assert_eq!(f["rows"][0]["buffs"][0], json!({ "name": "Courage Scroll", "upMs": 1000 }));
        assert_eq!(call("get_fight", json!({ "id": "zz" }))["result"]["isError"], true);
    }

    #[test]
    fn serves_json_rpc_over_http() {
        let path = std::env::temp_dir().join("aion2-mcp-test-fights.json");
        std::fs::write(&path, json!({ "format": 2, "fights": fights() }).to_string()).unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let post = |extra: &str| {
            let body = r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_fights","arguments":{"limit":1}}}"#;
            let mut c = TcpStream::connect(addr).unwrap();
            write!(c, "POST /mcp HTTP/1.1\r\nHost: x\r\n{extra}Content-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}", body.len()).unwrap();
            let (s, _) = listener.accept().unwrap();
            serve(s, &path, "1").unwrap();
            let mut out = String::new();
            c.read_to_string(&mut out).unwrap();
            out
        };
        ON.store(true, Ordering::Relaxed);
        let ok = post("");
        assert!(ok.starts_with("HTTP/1.1 200") && ok.contains(r#"\"id\":\"b\""#), "{ok}");
        assert!(post("Origin: https://evil.com\r\n").starts_with("HTTP/1.1 403"));
    }

    #[test]
    fn only_local_origins() {
        assert!(local_origin("http://localhost:1420") && local_origin("http://127.0.0.1") && local_origin("http://[::1]:80"));
        assert!(!local_origin("https://evil.com") && !local_origin("http://localhost.evil.com") && !local_origin("null"));
    }
}
