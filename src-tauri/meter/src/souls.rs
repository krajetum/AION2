//! Your mob kills that gave soul points, and your loots, with where the mob died (companion code).
//! The Map page's pet layer places them, so the player sees where each pet's soul points and shards
//! drop. Records, from the packet recordings of 2026-10-25 18:23 and 18:30 (13 kills of Slink, Young
//! Slink and Withered Branch Spider, Verteron) and 19:16 (a friend's: Mutated Forest Guardian,
//! Mutated Elim, Burned Wild Rat):
//!
//! ```text
//! <len> 04 8d <mob varint> <4 bytes> <owner varint> <server u16> <len><name> ...   the loot's owner
//! <len> 1e 56 01 <mob u32> <x y z f32> <x y z f32> <u32> <u32> <item u32> ...       an item a mob dropped there
//! <len> 0d 90 <n u8> (<kind u32> <points u32>) × n                                soul points (+points), n pets
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
//! - A `0d 90` can carry several pets: opening a chest of soul points (recording of 2026-11-22 13:29) sent one with
//!   n = 5, five kinds +5 each. Only `n = 1` was read before, so every such gain was lost and the collection fell
//!   behind the game's. Those are no kill's: only a single gain is paired with a kill waiting for its points.
//! - In a dungeon every loot's owner is 0 (recordings of 2026-11-22: Krao Cave, Urugugu Canyon, Fire Temple, Draupnir,
//!   Vakron Sky Island, Ferocious Horn Den, and the Hard dungeon of 2026-11-18; never in the open world's 1,400 loots), so
//!   no kill there waited for its points and no dungeon spot was placed. An owner of 0 now waits too (any party member's
//!   kill: points come only for yours, within 3 s, so a spot lands in the room you fought in); its items are not taken
//!   as your loots.
//! - A boss or mini-boss drops nothing on the ground: its `04 8d` (owner 0 in a dungeon) and, 0.1 s later, your
//!   `0d 90`, no `1e 56` (recording of 2026-11-22 18:53, Draupnir: Phantasmal Lakshmi, kind 1093 +1). Such points went
//!   to the collection but no spot. Now a `0d 90` with no loot waiting takes the last kill of yours (or a dungeon's)
//!   seen within 3 s with no loot, at your own position (as fresh as `HERE_FRESH_MS`): you stood by the boss.

use parking_lot::Mutex;
use serde::Serialize;
use std::collections::{HashMap, VecDeque};

use crate::capture::stream_processor::read_varint;

/// A `0d 90` this long after your loot is that kill's.
const POINTS_WITHIN_MS: i64 = 3_000;
/// Your position stands for a kill with no loot (a boss's) when read this recently.
const HERE_FRESH_MS: i64 = 15_000;
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
    /// Your kills' loots waiting for their soul points: (entity, xyz, when, its "Soul: X" item if seen).
    waiting: VecDeque<(i32, [f32; 3], i64, Option<u32>)>,
    /// A mob's "Soul: X (Bound)" item → the soul points' kind it goes with, learned from kills paired for sure.
    soul_kinds: HashMap<u32, u32>,
    kills: VecDeque<SoulKill>,
    loots: VecDeque<Loot>,
    gains: VecDeque<Gain>,
    /// Kills of yours (or a dungeon's) with no loot yet: (entity, when). A boss's never gets one.
    unlooted: VecDeque<(i32, i64)>,
    /// Your position when the frame came, if fresh: where a kill with no loot is placed.
    here: Option<[f32; 3]>,
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
/// A `0d 90` with more pets than this is not one.
const MAX_PETS_PER_GAIN: usize = 32;

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
    let pos = crate::position::latest();
    let map = pos.and_then(|p| p.map_id);
    let here = pos.filter(|p| now_ms - p.at_ms <= HERE_FRESH_MS).map(|p| [p.x, p.y, p.z]);
    with(|s| {
        s.here = here;
        read(s, frame, me, map, now_ms)
    });
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
            if me != 0 && (owner.value == me || owner.value == 0) {
                s.unlooted.retain(|u| now_ms - u.1 <= POINTS_WITHIN_MS && u.0 != mob.value);
                s.unlooted.push_back((mob.value, now_ms));
            }
        }
        [0x1E, 0x56] if *frame.get(body)? == 1 => {
            let mob = u32_at(frame, body + 1)? as i32;
            s.unlooted.retain(|u| u.0 != mob);
            // Yours, or a dungeon's (owner 0: see the top of this file).
            let yours = match s.owners.get(&mob) {
                Some(&o) if o == me => true,
                Some(0) => false,
                _ => return None,
            };
            let at = [f32_at(frame, body + 5)?, f32_at(frame, body + 9)?, f32_at(frame, body + 13)?];
            if !at.iter().all(|v| v.is_finite() && v.abs() < 1_000_000.0) {
                return None;
            }
            if let Some(item) = u32_at(frame, body + 37).filter(|&i| i != 0 && yours) {
                if s.loots.len() >= MAX_LOOTS {
                    s.loots.pop_front();
                }
                s.loots.push_back(Loot { entity: mob, item, x: at[0], y: at[1], z: at[2], map_id, at_ms: now_ms });
            }
            let soul = u32_at(frame, body + 37).filter(|i| SOUL_ITEMS.contains(i));
            // A kill's second item is the same kill: it waits once.
            if let Some(w) = s.waiting.iter_mut().find(|w| w.0 == mob && now_ms - w.2 <= POINTS_WITHIN_MS) {
                w.3 = w.3.or(soul);
                return Some(());
            }
            s.waiting.retain(|w| now_ms - w.2 <= POINTS_WITHIN_MS && w.0 != mob);
            s.waiting.push_back((mob, at, now_ms, soul));
        }
        [0x0D, 0x90] => {
            let n = *frame.get(body)? as usize;
            if !(1..=MAX_PETS_PER_GAIN).contains(&n) || frame.len() < body + 1 + 8 * n {
                return None;
            }
            let pairs: Vec<(u32, u32)> =
                (0..n).map(|i| Some((u32_at(frame, body + 1 + 8 * i)?, u32_at(frame, body + 5 + 8 * i)?))).collect::<Option<_>>()?;
            for &(kind, points) in &pairs {
                if s.gains.len() >= MAX_GAINS {
                    s.gains.pop_front();
                }
                // Strictly increasing times: the collection counts the gains after the last one it took (by time),
                // and several kills in one batch (an area attack) arrive in the same millisecond.
                let at_ms = s.gains.back().map_or(now_ms, |g| now_ms.max(g.at_ms + 1));
                s.gains.push_back(Gain { kind, points, at_ms });
            }
            if n != 1 {
                return Some(()); // a chest's: no kill
            }
            let (kind, points) = pairs[0];
            s.waiting.retain(|w| now_ms - w.2 <= POINTS_WITHIN_MS);
            let waited = !s.waiting.is_empty();
            // None: a boss's (no loot on the ground), placed where you stand.
            let (entity, [x, y, z]) = match pick(s, kind) {
                Some((entity, at, _, _)) => (entity, at),
                None if waited => return Some(()), // every kill waiting gives another pet: none of them is it
                None => {
                    s.unlooted.retain(|u| now_ms - u.1 <= POINTS_WITHIN_MS);
                    let (entity, _) = s.unlooted.pop_back()?;
                    (entity, s.here?)
                }
            };
            if s.kills.len() >= MAX_KILLS {
                s.kills.pop_front();
            }
            s.kills.push_back(SoulKill { entity, x, y, z, map_id, kind, points, at_ms: now_ms });
        }
        _ => {}
    }
    Some(())
}

/// The game's "Soul: X (Bound)" items: every kill drops its mob's (534660064 Vigilant Oculazen, 534660171 Mumu Worker;
/// shugo.gg names them, e.g. 534660067 = Soul: Papis), whether or not it gives soul points.
const SOUL_ITEMS: std::ops::Range<u32> = 534_660_000..534_670_000;

/// The kill waiting that a single gain of `kind` belongs to, taken out of `waiting`. Most kills give no points (the
/// pet done, or no drop this time), so the oldest kill waiting was often another mob's: a field of Mumu Workers and
/// Vigilant Oculazens put the Oculazens' points on the Workers (recording of 2026-11-22 00:37; every gain came 0.3 s
/// after an Oculazen's loot). So: the newest kill whose Soul item goes with this kind, else the newest whose item is
/// not known to go with another, else none. A kill alone in the window teaches its item's kind.
fn pick(s: &mut State, kind: u32) -> Option<(i32, [f32; 3], i64, Option<u32>)> {
    let known = |w: &(i32, [f32; 3], i64, Option<u32>)| w.3.and_then(|i| s.soul_kinds.get(&i).copied());
    let at = s.waiting.iter().rposition(|w| known(w) == Some(kind)).or_else(|| s.waiting.iter().rposition(|w| known(w).is_none()))?;
    let alone = s.waiting.len() == 1;
    let w = s.waiting.remove(at)?;
    if let (true, Some(item)) = (alone, w.3) {
        s.soul_kinds.entry(item).or_insert(kind);
    }
    Some(w)
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

    /// 2026-11-22 00:37: a Mumu Overseer's loot, then a Vigilant Oculazen's, then points for the Oculazen's pet (kind
    /// 1063): the newest kill gets them, not the oldest; once known, an item of another kind never does.
    #[test]
    fn points_go_to_the_newest_kill_whose_soul_fits() {
        let frames = [
            (0, "30048dbfd302fad1ba00fe760e090a52616e64726f6e69726b0a4169306e6c7966616e73020000000000000100"),
            (1, "471e5601bfa90000e1383247daa509c80040cc45c08232471a8709c80000ce45c13e0000c6fc0701def263240100000002f17b020000000e09cd31b200a2010000010301"),
            (868, "30048dd29a01fad1ba00fe760e090a52616e64726f6e69726b0a4169306e6c7966616e73020000000000000100"),
            (868, "471e5601524d0000a6743747f44009c800f0cd45d51a3747172b09c80098ce45c13e0000ebfc0701e043de1f0100000002f17b020000000e091e35b200a2010000010301"),
            (1410, "0f0d90012704000001000000"),
        ];
        let me = 15_230; // `fe 76`, Randronirk in that recording
        let mut s = State::default();
        for (t, f) in frames {
            read(&mut s, &hex(f), me, Some(1110), 1_000 + t);
        }
        assert_eq!(s.kills.iter().map(|k| (k.entity, k.kind)).collect::<Vec<_>>(), vec![(0x4d52, 1063)]);
        // The Oculazen's Soul item (534660064) was learned only if it waited alone: here two waited, so nothing yet.
        assert!(s.soul_kinds.is_empty());
        s.soul_kinds.insert(534_660_064, 1063);
        s.waiting.clear();
        for (t, f) in &frames[..4] {
            read(&mut s, &hex(f), me, Some(1110), 5_000 + t);
        }
        s.soul_kinds.insert(534_660_064, 1999); // the Oculazen's item goes with another pet: the Overseer's, unknown, takes them
        read(&mut s, &hex(frames[4].1), me, Some(1110), 6_410);
        assert_eq!(s.kills.back().map(|k| k.entity), Some(0xa9bf));
    }

    /// 2026-11-22 15:11, Krao Cave: a dungeon's loots have owner 0; the kill still gets your soul points and its place,
    /// its items are not taken as yours.
    #[test]
    fn a_dungeon_kill_gets_the_soul_points_and_its_place() {
        let mut s = State::default();
        let frames = [
            (0, "1b048de0ad016443b7000000000000000000000000000102"),
            (0, "471e5601e05600000f2ecfc60737c64600a0abc41584cfc6c652c7460060aac483010000fce00600e543de1f0100000001a2141a0083d6202452ab9b03a2010000010301"),
            (217, "0f0d90012c04000001000000"),
        ];
        for (t, f) in frames {
            read(&mut s, &hex(f), ME, Some(600002), 1_000 + t);
        }
        assert_eq!(s.kills.len(), 1);
        let k = s.kills[0];
        assert_eq!((k.entity, k.kind, k.points, k.map_id), (22240, 1068, 1, Some(600002)));
        assert!(s.loots.is_empty(), "a dungeon's loot is not yours");
    }

    /// 2026-11-22 18:53, Draupnir: a mini-boss's owner record and your points, no loot on the ground: placed where
    /// you stand; without a fresh position of yours, not placed (the points still count).
    #[test]
    fn a_boss_with_no_loot_is_placed_where_you_stand() {
        let frames = [(0, "1b048df4f901fad1ba000000000000000000000000000102"), (111, "0f0d90014504000001000000")];
        let mut s = State { here: Some([-9100.0, 7200.0, 300.0]), ..State::default() };
        for (t, f) in frames {
            read(&mut s, &hex(f), ME, Some(600031), 1_000 + t);
        }
        assert_eq!(s.kills.len(), 1);
        let k = s.kills[0];
        assert_eq!((k.entity, k.kind, k.points, k.x, k.map_id), (31988, 1093, 1, -9100.0, Some(600031)));
        let mut s = State::default();
        for (t, f) in frames {
            read(&mut s, &hex(f), ME, Some(600031), 1_000 + t);
        }
        assert!(s.kills.is_empty());
        assert_eq!(s.gains.len(), 1, "the points count anyway");
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

    /// Three mobs killed by one area attack: three gains in the same millisecond, each counted.
    #[test]
    fn gains_in_the_same_millisecond_get_their_own_times() {
        let mut s = State::default();
        for _ in 0..3 {
            read(&mut s, &hex("0f0d90016104000001000000"), ME, None, 1_000);
        }
        read(&mut s, &hex("0f0d90016104000001000000"), ME, None, 1_001);
        assert_eq!(s.gains.iter().map(|g| g.at_ms).collect::<Vec<_>>(), [1_000, 1_001, 1_002, 1_003]);
    }

    /// A chest of soul points: one `0d 90` with five pets, +5 each (recording of 2026-11-22 13:29), all counted, no kill.
    #[test]
    fn a_gain_of_several_pets_counts_each() {
        let mut s = State::default();
        read(&mut s, &hex("2f0d9005fd03000005000000400400000500000069040000050000008604000005000000ac04000005000000"), ME, None, 1_000);
        assert_eq!(
            s.gains.iter().map(|g| (g.kind, g.points)).collect::<Vec<_>>(),
            [(1021, 5), (1088, 5), (1129, 5), (1158, 5), (1196, 5)]
        );
        assert_eq!(s.gains.iter().map(|g| g.at_ms).collect::<Vec<_>>(), [1_000, 1_001, 1_002, 1_003, 1_004]);
        assert!(s.kills.is_empty());
        // Cut short: nothing taken.
        let mut t = State::default();
        read(&mut t, &hex("2f0d9005fd0300000500000040040000"), ME, None, 1_000);
        assert!(t.gains.is_empty());
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
