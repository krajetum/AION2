//! The arena's line-up (companion code): `19 e3`, sent a few seconds after entering an arena (2026-10-27:
//! 5 s into the 1v1 on map 61, and in the 5v5), lists every player of the match by team, each with the server
//! and level the game sends for no opponent anywhere else:
//!
//! ```text
//! per team:   <v u32> 00 00 00 00 <v u32> <players u32>          (v: 1656 for the 1v1's you, a rating?)
//!   per player: <character u32> 00 00 <server u16> <name len u8> <name> <class u32> <race u8: 1|2> <level u32>
//!               00000000 <server2 u16> <u32> ...
//! The two servers are mostly the same. Where they differ the second is the player's: the game showed Jedaq (SIE)
//! = Siel 1301 in the 5v5 of 2026-10-27 19:30, first 1321, second 1301 (and spawn records carry the second).
//! The u32 after it is the player's RP before the match (Randronirk 1307, then 1280 after -27, as the game said);
//! a team header's v is the team's RP (1,341 and 1,340 on screen).
//! ```
//! A player's team is the last team header before it (0, 1).
//!
//! Checked against the recordings: Randronirk 2318 (Baba, his self record says the same) level 45 on the team
//! of Blackdevil, Dewy, Atticus and MOLDDRED; Ezio, Deepstrike, Oxsi, MentalGesund and Yuzunamiku on the other
//! (the four of them who fought are the 5v5's opponents); Nocturna 2316 (the 1v1's opponent). A player is
//! read only when both servers are set, the race is 1 or 2, the level 1-100 and the zeros are there.
//!
//! Outside arenas (the Abyss) there is no line-up: other players' servers come from their spawn records
//! (`spawn_server`), for the kill history and the shugo.gg link.

use std::collections::HashMap;

use parking_lot::Mutex;
use serde::Serialize;

use crate::capture::stream_processor::read_varint;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RosterPlayer {
    pub name: String,
    pub server_id: u16,
    pub level: i32,
    /// 0 or 1: the team header the player comes after.
    pub team: u32,
}

/// The last line-up read, and when.
static LAST: Mutex<Option<(i64, Vec<RosterPlayer>)>> = Mutex::new(None);

/// The last line-up read, and whether it came at or after `after_ms` (a match's start: its teams are that
/// match's; an older one still gives servers and levels by name, as when a 1v1 round reloads the map).
pub fn latest(after_ms: i64) -> (Vec<RosterPlayer>, bool) {
    LAST.lock().as_ref().map(|(at, r)| (r.clone(), *at >= after_ms)).unwrap_or_default()
}

/// Servers from other players' spawn records (`45 36`), by name.
static SPAWNED: Mutex<Option<HashMap<String, u16>>> = Mutex::new(None);
const MAX_SPAWNED: usize = 20_000;

/// A player's server: from the last line-up, else from their spawn record (0: neither said).
pub fn server_of(name: &str) -> u16 {
    let name = name.trim();
    let listed = LAST.lock().as_ref().and_then(|(_, r)| r.iter().find(|p| p.name == name).map(|p| p.server_id));
    listed.or_else(|| SPAWNED.lock().as_ref()?.get(name).copied()).unwrap_or(0)
}

/// Reads one game frame (its length varint, 2-byte type, body), as the parser hands it on.
pub fn observe(frame: &[u8], now_ms: i64) {
    if let Some(players) = read(frame) {
        *LAST.lock() = Some((now_ms, players));
    } else if let Some((name, server)) = spawn_server(frame) {
        let mut seen = SPAWNED.lock();
        let seen = seen.get_or_insert_with(HashMap::new);
        if seen.len() < MAX_SPAWNED || seen.contains_key(&name) {
            seen.insert(name, server);
        }
    }
}

/// A server id as the game numbers them: 1xxx Elyos, 2xxx Asmodian, the hundreds the region, then 01-58
/// (A2Tools' server table).
fn server_like(v: u16) -> bool {
    (1..=2).contains(&(v / 1000)) && (v % 1000) / 100 <= 5 && (1..=58).contains(&(v % 100))
}

/// Another player's name and server from their spawn record (`45 36`, the mask-gated name as A2Tools reads it).
/// The server sits ~100 bytes after the name, after `a0 86 01 00 a0 86 01 00` (100,000 twice) and a pair of equal
/// u32: either as the legion's `<server u16> <u32> 00 00 <server u16, again> <legion name>`, or after a run of
/// `01|02` + 3 byte entries (optionally led by `01 00 00 00`) and a `00|01|02` byte. Checked on 692 spawns in the
/// recordings of 2026-10-23 to 27: 540 of 557 players got one, never two different ones; in the Abyss every one
/// Baba (2318) or Kochi (1318), the only two servers there (the player); in the arenas the servers their line-up
/// gives as its second one (`19 e3`).
fn spawn_server(frame: &[u8]) -> Option<(String, u16)> {
    let len = read_varint(frame, 0);
    if len.length <= 0 {
        return None;
    }
    let body = len.length as usize + 2;
    if frame.get(body - 2..body)? != [0x45, 0x36] {
        return None;
    }
    let id = read_varint(frame, body);
    if id.length <= 0 {
        return None;
    }
    let mask2 = body + id.length as usize + 4;
    if frame.get(mask2)? & 0x01 == 0 {
        return None;
    }
    let n = *frame.get(mask2 + 1)? as usize;
    let name = std::str::from_utf8(frame.get(mask2 + 2..mask2 + 2 + n)?).ok()?;
    if n == 0 || name.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return None;
    }
    const ANCHOR: [u8; 8] = [0xa0, 0x86, 0x01, 0x00, 0xa0, 0x86, 0x01, 0x00];
    let after = mask2 + 2 + n;
    let anchor = frame.get(after..)?.windows(8).position(|w| w == ANCHOR)? + after;
    let p = anchor + 16;
    let u16_ = |k: usize| u16_at(frame, k);
    // The legion form: the server twice, 8 bytes apart, two zero bytes before the second.
    for k in p..(p + 64).min(frame.len().saturating_sub(10)) {
        if let Some(v) = u16_(k).filter(|&v| server_like(v)) {
            if u16_(k + 8) == Some(v) && frame.get(k + 6..k + 8) == Some(&[0, 0]) {
                return Some((name.to_string(), v));
            }
        }
    }
    // The entry run.
    let mut k = p;
    if frame.get(k..k + 4) == Some(&[1, 0, 0, 0]) {
        k += 4;
    }
    for _ in 0..8 {
        if !matches!(frame.get(k)?, 0..=2) {
            return None;
        }
        if let Some(v) = u16_(k + 1).filter(|&v| server_like(v)) {
            return Some((name.to_string(), v));
        }
        k += 4;
    }
    None
}

fn u16_at(b: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_le_bytes(b.get(at..at + 2)?.try_into().ok()?))
}
fn u32_at(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

fn read(frame: &[u8]) -> Option<Vec<RosterPlayer>> {
    let len = read_varint(frame, 0);
    if len.length <= 0 {
        return None;
    }
    let body = len.length as usize + 2;
    if frame.get(body - 2..body)? != [0x19, 0xE3] {
        return None;
    }
    let mut out: Vec<RosterPlayer> = Vec::new();
    // Team headers: the same u32 twice, 4 zero bytes between, then a player count.
    let headers: Vec<usize> = (body..frame.len().saturating_sub(16))
        .filter(|&h| {
            let (a, b, n) = (u32_at(frame, h), u32_at(frame, h + 8), u32_at(frame, h + 12));
            a.is_some_and(|a| a != 0 && Some(a) == b) && frame[h + 4..h + 8] == [0; 4] && n.is_some_and(|n| (1..=12).contains(&n))
        })
        .collect();
    for p in body + 2..frame.len() {
        let n = frame[p] as usize;
        if !(2..=24).contains(&n) {
            continue;
        }
        let Some(name) = frame.get(p + 1..p + 1 + n).and_then(|b| std::str::from_utf8(b).ok()) else { continue };
        if name.chars().any(|c| c.is_control() || c.is_whitespace()) {
            continue;
        }
        let after = p + 1 + n;
        let (Some(server), Some(race), Some(level), Some(zero), Some(again)) = (
            u16_at(frame, p - 2),
            frame.get(after + 4).copied(),
            u32_at(frame, after + 5),
            u32_at(frame, after + 9),
            u16_at(frame, after + 13),
        ) else {
            continue;
        };
        if server == 0 || again == 0 || !(1..=2).contains(&race) || !(1..=100).contains(&level) || zero != 0 {
            continue;
        }
        let team = headers.iter().filter(|&&h| h < p).count().saturating_sub(1) as u32;
        if !out.iter().any(|q| q.name == name) {
            out.push(RosterPlayer { name: name.to_string(), server_id: again, level: level as i32, team });
        }
    }
    (!out.is_empty()).then_some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }

    /// The 1v1 of 2026-10-27 18:29 (map 61): you and Nocturna.
    #[test]
    fn the_1v1_line_up() {
        let mut f = hex("85fc08010000001600000000000000080000000201780600000000000078060000010000000000000000f17b020000000e090a52616e64726f6e69726b0c000000022d000000000000000e0978060000000000000178060000000000000f0a007806000000026f060000000000006f06000001000000000000000083cf020000000c09084e6f637475726e610c000000022d000000000000000c096f06000000000000016f060000000000000a05006f06000000");
        let mut framed = vec![0xb7, 0x01, 0x19, 0xe3];
        framed.append(&mut f);
        let r = read(&framed).unwrap();
        assert_eq!(r, vec![
            RosterPlayer { name: "Randronirk".into(), server_id: 2318, level: 45, team: 0 },
            RosterPlayer { name: "Nocturna".into(), server_id: 2316, level: 45, team: 1 },
        ]);
    }

    /// The 5v5 of 2026-10-27 18:34: two teams of five.
    #[test]
    fn the_5v5_line_up() {
        let mut f = hex("99ff08020000002c000000000000000800000002018f050000000000008f050000050000000000000000248d03000000fd0804457a696f13000000022d00000000000000fd08910500000000000002910500000000000006080091050000000000000000000000389403000000ff080a44656570737472696b6510000000022d00000000000000ff0899050000000000000299050000000000000b0e0099050000000000000000000000bd39000000001109044f78736920000000022d00000000000000110988050000000000000288050000000000000003008805000000000000000000000052370300000000090c4d656e74616c476573756e6418000000022d000000000000000209910500000000000002910500000000000000040091050000000000000000000000367b0100000013090a59757a756e616d696b7514000000022d0000000000000013098c05000000000000028c050000000000000104008c0500000002930500000000000093050000050000000000000000f17b020000000e090a52616e64726f6e69726b0c000000022d000000000000000e093105000000000000023105000000000000020700310500000000000000000000006c390300000000090a426c61636b646576696c1c000000022d000000000000000009bf0500000000000002bf05000000000000000100bf0500000000000000000000003c9d000000002905044465777912000000012d000000000000001805c30500000000000002c305000000000000010200c3050000000000000000000000b67b03000000fe08074174746963757310000000022d00000000000000fe089f05000000000000029f050000000000000002009f050000000000000000000000267e030000001705084d4f4c444452454415000000012d0000000000000017058f05000000000000028f050000000000000508008f05000000");
        let mut framed = vec![0xbd, 0x05, 0x19, 0xe3];
        framed.append(&mut f);
        let r = read(&framed).unwrap();
        let names: Vec<(&str, u16)> = r.iter().map(|p| (p.name.as_str(), p.server_id)).collect();
        assert_eq!(names, [("Ezio", 2301), ("Deepstrike", 2303), ("Oxsi", 2321), ("MentalGesund", 2306), ("Yuzunamiku", 2323),
            ("Randronirk", 2318), ("Blackdevil", 2304), ("Dewy", 1304), ("Atticus", 2302), ("MOLDDRED", 1303)]);
        assert!(r.iter().all(|p| p.level == 45));
        assert_eq!(r.iter().map(|p| p.team).collect::<Vec<_>>(), [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
    }

    /// The 5v5 of 2026-10-27 19:30, as the game showed it: (KRO) xSmithBLKx, (HIT) TQA, (BAB) maestor, (SIE) Jedaq,
    /// (BAB) Akavedia against (BAB) Randronirk, (ARI) Cymaril, (LUD) Blazo, (KRO) Шпак, (ODA) Airan. Jedaq's first
    /// server says 1321, the second 1301 = Siel: the second is the player's.
    #[test]
    fn the_line_up_matches_the_games_screen() {
        let r = read(&hex(include_str!("lineup_5v5_1930.hex").trim())).unwrap();
        let got: Vec<(&str, u16, u32)> = r.iter().map(|p| (p.name.as_str(), p.server_id, p.team)).collect();
        assert_eq!(got, [("xSmithBLKx", 2316, 0), ("TQA", 1309, 0), ("maestor", 2318, 0), ("Jedaq", 1301, 0), ("Akavedia", 2318, 0),
            ("Randronirk", 2318, 1), ("Cymaril", 1306, 1), ("Blazo", 2311, 1), ("Шпак", 2316, 1), ("Airan", 2314, 1)]);
    }

    /// Spawns of 2026-10-27: an Elyos in the Abyss with a legion (Kochi), and the 5v5's Deepstrike (no legion).
    #[test]
    fn a_spawn_says_the_players_server() {
        assert_eq!(spawn_server(&hex(include_str!("spawn_kochi.hex").trim())), Some(("S1appy".to_string(), 1318)));
        assert_eq!(spawn_server(&hex(include_str!("spawn_deepstrike.hex").trim())), Some(("Deepstrike".to_string(), 2303)));
        assert_eq!(spawn_server(&hex("0f0d90016104000001000000")), None);
    }

    #[test]
    fn other_records_are_no_line_up() {
        assert_eq!(read(&hex("0f0d90016104000001000000")), None);
    }
}
