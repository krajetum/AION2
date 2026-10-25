//! Your own position, as the game's traffic gives it (companion code). The server never streams your
//! movement back to you, but three records carry where you are:
//!
//! ```text
//! <len> 21 36 <u32> <map u32> <8 bytes> <x f32> <y f32> <z f32> ...   map load (teleports, zone changes)
//! <len> 23 36 00 <5 bytes> <x f32> <y f32> <z f32> ...                you placed (right after a map load)
//! <len> 2a 38 | 2b 38 ... <caster> ... <x f32> <y f32> <z f32>         a buff or debuff added / changed:
//!                                                                     the caster's position ends the record
//! ```
//!
//! The last one comes every few seconds while you play (your own buffs, procs, skills), so the map
//! follows you with a few seconds' lag, and stands still when nothing is applied.
//!
//! The map id comes with map loads. Until one is seen (the meter started with you already in the
//! world), the field-boss map the game sends when you open its map (`01 91`, `capture::boss_map`:
//! "only the home map and the Abyss come this way") names it: 20 in the Abyss recording of
//! 2026-10-25, 1110 in the world recordings of 2026-10-23, the same as their map loads. That is taken
//! only while no load has said, and the kills read meanwhile get it too (`souls::fill_map`). Found in the packet
//! recording of 2026-10-23 (two teleports, three walks): the map-load and placed positions match to
//! the unit, and the buff positions track the walk between them. Layout of 2a/2b 38: `capture::abnormal`.

use parking_lot::Mutex;
use serde::Serialize;
use std::sync::atomic::{AtomicI32, Ordering};

use crate::capture::abnormal::{self, Record};
use crate::capture::stream_processor::read_varint;

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SelfPosition {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    /// The map of the last map load, if one was seen.
    pub map_id: Option<i32>,
    /// When it was read (unix ms).
    pub at_ms: i64,
}

static ME: AtomicI32 = AtomicI32::new(0);
static LAST: Mutex<Option<SelfPosition>> = Mutex::new(None);
static MAP: Mutex<Option<i32>> = Mutex::new(None);

/// Your entity id, as the meter knows it (the engine sets it with every update).
pub fn set_me(id: Option<i32>) {
    ME.store(id.unwrap_or(0), Ordering::Relaxed);
}

/// Your entity id, 0 until the meter knows it.
pub fn me() -> i32 {
    ME.load(Ordering::Relaxed)
}

/// The last position read, if any.
pub fn latest() -> Option<SelfPosition> {
    *LAST.lock()
}

/// Forget it (a capture restart).
pub fn reset() {
    *LAST.lock() = None;
    *MAP.lock() = None;
}

fn f32_at(b: &[u8], at: usize) -> Option<f32> {
    Some(f32::from_le_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

fn xyz_at(b: &[u8], at: usize) -> Option<(f32, f32, f32)> {
    let (x, y, z) = (f32_at(b, at)?, f32_at(b, at + 4)?, f32_at(b, at + 8)?);
    // World coordinates seen are within ±300,000; anything else is not a position.
    let ok = |v: f32| v.is_finite() && v.abs() < 1_000_000.0;
    (ok(x) && ok(y) && ok(z) && (x != 0.0 || y != 0.0)).then_some((x, y, z))
}

/// Reads one game frame (its length varint, 2-byte type, body), as the parser hands it on.
pub fn observe(frame: &[u8]) {
    let learned = {
        let mut map = MAP.lock();
        let learned = learn_map(frame, &mut map);
        if let Some(p) = read(frame, ME.load(Ordering::Relaxed), &mut map, crate::clock::now_ms()) {
            *LAST.lock() = Some(p);
        }
        learned
    };
    if let Some(id) = learned {
        if let Some(p) = LAST.lock().as_mut() {
            p.map_id.get_or_insert(id);
        }
        crate::souls::fill_map(id);
    }
}

/// The map a field-boss map record (`01 91`, header 0) names, taken while no map load has said.
fn learn_map(frame: &[u8], map: &mut Option<i32>) -> Option<i32> {
    if map.is_some() {
        return None;
    }
    let len = read_varint(frame, 0);
    if len.length <= 0 {
        return None;
    }
    let body = len.length as usize + 2;
    if frame.get(body - 2..body)? != [0x01, 0x91] || frame.get(body..body + 2)? != [0, 0] {
        return None;
    }
    let id = i32::from_le_bytes(frame.get(body + 2..body + 6)?.try_into().ok()?);
    (1..10_000_000).contains(&id).then(|| {
        *map = Some(id);
        id
    })
}

/// The position in `frame`, if it holds yours. `map` keeps the map of the last map load.
fn read(frame: &[u8], me: i32, map: &mut Option<i32>, now_ms: i64) -> Option<SelfPosition> {
    let len = read_varint(frame, 0);
    if len.length <= 0 {
        return None;
    }
    let o = len.length as usize;
    let op = frame.get(o..o + 2)?;
    let body = o + 2;
    let at = |(x, y, z): (f32, f32, f32), map_id| SelfPosition { x, y, z, map_id, at_ms: now_ms };
    match op {
        [0x21, 0x36] => {
            let id = i32::from_le_bytes(frame.get(body + 4..body + 8)?.try_into().ok()?);
            *map = Some(id);
            xyz_at(frame, body + 16).map(|p| at(p, Some(id)))
        }
        [0x23, 0x36] if *frame.get(body)? == 0 => xyz_at(frame, body + 6).map(|p| at(p, *map)),
        [0x2A, 0x38] | [0x2B, 0x38] if me != 0 => match abnormal::parse(frame)? {
            Record::Added(a) | Record::Changed(a) if a.caster == me => {
                xyz_at(frame, frame.len().checked_sub(12)?).map(|p| at(p, *map))
            }
            _ => None,
        },
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }
    const ME: i32 = 4061; // `dd 1f`, from the self record of the same capture

    /// Frames of the 2026-10-23 recording: a teleport to an obelisk (map load, then "placed").
    #[test]
    fn teleports_give_the_position_and_the_map() {
        let mut map = None;
        let load = hex("3421360300000056040000d4df590000000000d09cd5476fcf38480070944631b3ccc20200000000000000000000000000");
        let p = read(&load, ME, &mut map, 1).unwrap();
        assert_eq!((p.x.round(), p.y.round(), p.z.round(), p.map_id), (109370.0, 189246.0, 19000.0, Some(1110)));
        let placed = hex("1e2336000000000000fd123948f384b3c70054724602000000ec56");
        let p = read(&placed, ME, &mut map, 2).unwrap();
        assert_eq!((p.x.round(), p.y.round(), p.z.round(), p.map_id, p.at_ms), (189516.0, -91914.0, 15509.0, Some(1110), 2));
    }

    /// Buffs you cast carry your position; other casters' are not yours.
    #[test]
    fn your_buffs_give_your_position() {
        let mut map = None;
        let added = hex("302a38dd1f0111c101c80000002c01000000000000ebd2d369a1010000dd1f0100e33aa1c70279ffc7007f0647");
        let p = read(&added, ME, &mut map, 5).unwrap();
        assert_eq!((p.x.round(), p.y.round(), p.z.round(), p.map_id), (-82550.0, -130802.0, 34431.0, None));
        let with_skill = hex("342a38dd1f0113c201d5475101e093040000000000d36dd869a1010000dd1f0162ba2100003d8ba4c70e72fdc7466a0547");
        assert_eq!(read(&with_skill, ME, &mut map, 5).map(|p| (p.x.round(), p.y.round())), Some((-84246.0, -129764.0)));
        let changed = hex("2e2b38dd1f1114844e0000aa0bd21301000000b199a67da2010000dd1f0802cebfe2c7762c05c83af20a47");
        assert_eq!(read(&changed, ME, &mut map, 5).map(|p| (p.x.round(), p.y.round())), Some((-116096.0, -136370.0)));
        // Someone else's buff, and yours before the meter knows who you are.
        let other = hex("302a38ce0a0111b804122700008813000000000000b356d369a1010000ce0a0100d4af93c7d57a03c800e60d47");
        assert_eq!(read(&other, ME, &mut map, 5), None);
        assert_eq!(read(&added, 0, &mut map, 5), None);
    }

    /// 2026-10-25 14:28: the Abyss's field-boss map, 3 s into a recording that saw no map load yet.
    #[test]
    fn the_boss_map_names_the_map_until_a_load_does() {
        let boss_map = hex("6901910000140000000800d10f0000aca873a101000000");
        let mut map = None;
        assert_eq!(learn_map(&boss_map, &mut map), Some(20));
        assert_eq!(map, Some(20));
        assert_eq!(learn_map(&boss_map, &mut map), None, "known already");
        let mut loaded = Some(1110);
        assert_eq!(learn_map(&boss_map, &mut loaded), None, "a map load's word stands");
        assert_eq!(loaded, Some(1110));
    }

    #[test]
    fn other_records_are_not_positions() {
        let mut map = None;
        assert_eq!(read(&hex("111d37a9322f039a3a1d246a246a"), ME, &mut map, 1), None);
        assert_eq!(read(&hex("0e0036cc85d769a1010000"), ME, &mut map, 1), None);
        assert_eq!(read(&[], ME, &mut map, 1), None);
    }
}
