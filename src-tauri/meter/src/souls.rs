//! Your mob kills that gave soul points, and your loots, with where the mob died (companion code).
//! The Map page's pet layer places them, so the player sees where each pet's soul points and shards
//! drop. Records, from the packet recordings of 2026-10-25 18:23 and 18:30 (13 kills of Slink, Young
//! Slink and Withered Branch Spider, Verteron) and 19:16 (a friend's: Mutated Forest Guardian,
//! Mutated Elim, Burned Wild Rat):
//!
//! ```text
//! <len> 04 8d <mob varint> <4 bytes> <owner varint> <server u16> <len><name> ...   the loot's owner
//! <len> 1e 56 01 <mob u32> <x y z f32> <x y z f32> <u32> <u32> <item u32> ...       an item a mob dropped there
//! <len> 0d 90 01 <kind u32> <points u32>                                          soul points (+points)
//! ```
//!
//! - One `1e 56` per item: a kill dropping two items sends two, with the same mob and place. The item
//!   code is the same for every drop of one thing (534660178 on every Mutated Forest Guardian, 610531002
//!   on three of them: the "Agrint" the player looted). The game data here has no item names, so the
//!   player names the codes that are shards (the app); every loot of yours is passed on.
//! - Every kill of yours (owner = you) was followed, 0.3-0.5 s later, by one `0d 90` with 1 point; the
//!   loots of other players' kills in the same recordings never were, and no `0d 90` came without a
//!   kill of yours (none in five recordings without kills).
//! - `kind` is the same for every kill of one mob (Slink 1016, Young Slink 1121, Withered Branch
//!   Spider 1116), but not the soul's: the player's Young Slink kills gave "Slink soul points". So
//!   the soul is named by the player per mob (the app), and `kind` is only passed on.
//! - Every `0d 90` is also kept as a gain (`gains`): the collection counts them all, placed or not.

use parking_lot::Mutex;
use serde::Serialize;
use std::collections::{HashMap, VecDeque};

use crate::capture::stream_processor::read_varint;

/// A `0d 90` this long after your loot is that kill's.
const POINTS_WITHIN_MS: i64 = 3_000;
const MAX_OWNERS: usize = 2_000;
const MAX_KILLS: usize = 200;
const MAX_LOOTS: usize = 200;

/// An item a mob you killed dropped for you, and where the mob died.
#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Loot {
    pub entity: i32,
    pub item: u32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub map_id: Option<i32>,
    pub at_ms: i64,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SoulKill {
    /// The mob's entity (its code and name come from the meter's spawn records: `engine.rs`).
    pub entity: i32,
    /// Where it died (its loot's position), game units.
    pub x: f32,
    pub y: f32,
    pub z: f32,
    /// The map of the last map load, if one was seen.
    pub map_id: Option<i32>,
    pub kind: u32,
    pub points: u32,
    pub at_ms: i64,
}

#[derive(Default)]
struct State {
    /// Mob entity → its loot's owner entity (the `04 8d` records seen lately).
    owners: HashMap<i32, i32>,
    /// Your kills' loots waiting for their soul points: (entity, xyz, when).
    waiting: VecDeque<(i32, [f32; 3], i64)>,
    kills: VecDeque<SoulKill>,
    loots: VecDeque<Loot>,
    gains: VecDeque<Gain>,
}

/// Soul points the game gave you, whether or not a loot of yours places them: the collection counts them all
/// (party kills whose loot went to someone else, points picked up late; 2026-10-26: the Pets page fell behind).
#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Gain {
    pub kind: u32,
    pub points: u32,
    pub at_ms: i64,
}
const MAX_GAINS: usize = 1_000;

static STATE: Mutex<Option<State>> = Mutex::new(None);

fn with<T>(f: impl FnOnce(&mut State) -> T) -> T {
    f(STATE.lock().get_or_insert_with(State::default))
}

/// Your kills with soul points since the meter started, oldest first (the last MAX_KILLS).
pub fn snapshot() -> Vec<SoulKill> {
    with(|s| s.kills.iter().copied().collect())
}

/// Every soul point gain since the meter started, oldest first (the last MAX_GAINS).
pub fn gains() -> Vec<Gain> {
    with(|s| s.gains.iter().copied().collect())
}

/// Your loots since the meter started, oldest first (the last MAX_LOOTS).
pub fn loots() -> Vec<Loot> {
    with(|s| s.loots.iter().copied().collect())
}

/// The map learned for kills and loots read before the meter knew it (`position.rs`): no map load came
/// between, so they were on it.
pub fn fill_map(id: i32) {
    with(|s| {
        for k in s.kills.iter_mut().filter(|k| k.map_id.is_none()) {
            k.map_id = Some(id);
        }
        for l in s.loots.iter_mut().filter(|l| l.map_id.is_none()) {
            l.map_id = Some(id);
        }
    });
}

/// Forget everything (a capture restart).
pub fn reset() {
    *STATE.lock() = None;
}

/// Reads one game frame (its length varint, 2-byte type, body), as the parser hands it on.
pub fn observe(frame: &[u8], me: i32, now_ms: i64) {
    // Read even before the meter knows who you are: soul points are yours whatever the loots say
    // (with `me` 0 no loot is yours, so nothing is placed).
    let map = crate::position::latest().and_then(|p| p.map_id);
    with(|s| read(s, frame, me, map, now_ms));
}

fn u32_at(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(b.get(at..at + 4)?.try_into().ok()?))
}
fn f32_at(b: &[u8], at: usize) -> Option<f32> {
    Some(f32::from_le_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

fn read(s: &mut State, frame: &[u8], me: i32, map_id: Option<i32>, now_ms: i64) -> Option<()> {
    let len = read_varint(frame, 0);
    if len.length <= 0 {
        return None;
    }
    let body = len.length as usize + 2;
    match frame.get(body - 2..body)? {
        [0x04, 0x8D] => {
            let mob = read_varint(frame, body);
            if mob.length <= 0 {
                return None;
            }
            let owner = read_varint(frame, body + mob.length as usize + 4);
            if owner.length <= 0 {
                return None;
            }
            if s.owners.len() >= MAX_OWNERS {
                s.owners.clear();
            }
            s.owners.insert(mob.value, owner.value);
        }
        [0x1E, 0x56] if *frame.get(body)? == 1 => {
            let mob = u32_at(frame, body + 1)? as i32;
            if s.owners.get(&mob) != Some(&me) {
                return None;
            }
            let at = [f32_at(frame, body + 5)?, f32_at(frame, body + 9)?, f32_at(frame, body + 13)?];
            if !at.iter().all(|v| v.is_finite() && v.abs() < 1_000_000.0) {
                return None;
            }
            if let Some(item) = u32_at(frame, body + 37).filter(|&i| i != 0) {
                if s.loots.len() >= MAX_LOOTS {
                    s.loots.pop_front();
                }
                s.loots.push_back(Loot { entity: mob, item, x: at[0], y: at[1], z: at[2], map_id, at_ms: now_ms });
            }
            // A kill's second item is the same kill: it waits once.
            if s.waiting.iter().any(|w| w.0 == mob && now_ms - w.2 <= POINTS_WITHIN_MS) {
                return Some(());
            }
            s.waiting.retain(|w| now_ms - w.2 <= POINTS_WITHIN_MS && w.0 != mob);
            s.waiting.push_back((mob, at, now_ms));
        }
        [0x0D, 0x90] if *frame.get(body)? == 1 => {
            let (kind, points) = (u32_at(frame, body + 1)?, u32_at(frame, body + 5)?);
            if s.gains.len() >= MAX_GAINS {
                s.gains.pop_front();
            }
            s.gains.push_back(Gain { kind, points, at_ms: now_ms });
            s.waiting.retain(|w| now_ms - w.2 <= POINTS_WITHIN_MS);
            // The oldest kill still waiting: points come in the order of the kills.
            let (entity, [x, y, z], _) = s.waiting.pop_front()?;
            if s.kills.len() >= MAX_KILLS {
                s.kills.pop_front();
            }
            s.kills.push_back(SoulKill { entity, x, y, z, map_id, kind, points, at_ms: now_ms });
        }
        _ => {}
    }
    Some(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }
    const ME: i32 = 5259; // `8b 29`, Randronirk in the same recording

    /// 2026-10-25 18:30:46: your kill and another player's land together; only yours gets the points.
    #[test]
    fn your_kill_gets_the_soul_points_and_its_place() {
        let mut s = State::default();
        let frames = [
            (0, "23048d96b103e76bdb00ad0b0e09074368616572797300000000000000000100"), // Chaerys owns 55446's loot
            (0, "31048d96bb0342c6ba008b290e090a52616e64726f6e69726b0b496e697469617469766532020000000000000100"), // you own 56726's
            (0, "471e560196dd0000c029184800cec747003039450112184896e9c74700f03845c29b00005b081b00af43de1f0100000002f17b020000000e0907461f74a1010000010301"),
            (0, "471e560196d80000ab851b481e16d147007067456e701b48a353d14700306845ad9d00005c081b00af43de1f0100000001d3e40400b4976c1307461f74a1010000010301"),
            (543, "0f0d9001f803000001000000"),
        ];
        for (t, f) in frames {
            read(&mut s, &hex(f), ME, Some(7), 1_000 + t);
        }
        assert_eq!(s.kills.len(), 1);
        let k = s.kills[0];
        assert_eq!((k.entity, k.kind, k.points, k.at_ms, k.map_id), (56726, 1016, 1, 1_543, Some(7)));
        assert_eq!((k.x.round(), k.y.round()), (155815.0, 102300.0));
    }

    /// 2026-10-25 19:16 (a friend's recording): a Mutated Forest Guardian of yours drops two items,
    /// Agrint (610531002) and its usual one; another player's Mutated Elim drops one for them.
    #[test]
    fn your_loots_are_kept_with_their_items() {
        let mut s = State::default();
        let me = 12996; // `c4 65`, Selphine
        for f in [
            "2f048df98c01a4aaf500c4650e090853656c7068696e650b496e697469617469766532020000000000000100",
            "471e560179460000203286c6b7001947006066466dbb86c6a1571947008066469083000026ae1d00baf6632401000000020eb4020000000e09e0725b74a1010000010301",
            "471e560179460000203286c6b700194700606646907586c6e18a1847006866469083000027ae1d005244de1f01000000020eb4020000000e09e0725b74a1010000010301",
            "22048dcbdf0260dc0301be560e09064661666e697000000000000000000100",
            "471e5601cbaf0000b72845c6654b124700906446650945c6e6cd1247007864469d820000b5aa1d006744de1f0100000002bdbe020000000e0924255b74a1010000010301",
        ] {
            read(&mut s, &hex(f), me, Some(1010), 5_000);
        }
        assert_eq!(s.loots.iter().map(|l| (l.entity, l.item)).collect::<Vec<_>>(), [(18041, 610531002), (18041, 534660178)]);
        assert_eq!((s.loots[0].x.round(), s.loots[0].y.round(), s.loots[0].map_id), (-17177.0, 39169.0, Some(1010)));
        assert_eq!(s.waiting.len(), 1, "one kill waits for soul points, not one per item");
    }

    /// Points with no loot of yours waiting (a party member's loot, a late pick-up) still count for the
    /// collection, though they place no spot.
    #[test]
    fn every_soul_point_counts_even_without_a_loot_of_yours() {
        let mut s = State::default();
        read(&mut s, &hex("0f0d90016104000001000000"), ME, None, 1_000);
        read(&mut s, &hex("0f0d90014904000001000000"), 0, None, 2_000);
        assert!(s.kills.is_empty());
        assert_eq!(s.gains.iter().map(|g| (g.kind, g.points, g.at_ms)).collect::<Vec<_>>(), [(1121, 1, 1_000), (1097, 1, 2_000)]);
    }

    #[test]
    fn points_without_a_kill_of_yours_or_too_late_are_not_placed() {
        let mut s = State::default();
        read(&mut s, &hex("0f0d90016104000001000000"), ME, None, 1_000);
        assert!(s.kills.is_empty(), "no kill waiting");
        read(&mut s, &hex("31048dc6fa02f4a2b8008b290e090a52616e64726f6e69726b0b496e697469617469766532020000000000000100"), ME, None, 2_000);
        read(&mut s, &hex("471e560146bd0000826319482a23d047006061454b751948f864d04700506245ac9d000017031b003b44de1f0100000002f17b020000000e097bd71e74a1010000010301"), ME, None, 2_000);
        read(&mut s, &hex("0f0d90016104000001000000"), ME, None, 9_000);
        assert!(s.kills.is_empty(), "7 s later is not that kill's");
        // The same kill in time: Young Slink's kind.
        read(&mut s, &hex("471e560146bd0000826319482a23d047006061454b751948f864d04700506245ac9d000017031b003b44de1f0100000002f17b020000000e097bd71e74a1010000010301"), ME, None, 10_000);
        read(&mut s, &hex("0f0d90016104000001000000"), ME, None, 10_433);
        assert_eq!(s.kills.iter().map(|k| (k.entity, k.kind)).collect::<Vec<_>>(), [(48454, 1121)]);
    }
}
