//! Hidden cubes, as the game's traffic shows them (companion code). Records, from the packet
//! recordings of 2026-10-23 (three cubes opened, one of them by another player):
//!
//! ```text
//! <len> 34 36 <entity> <kind u16> <code u32> <x f32> <y f32> <z f32> ...   an object comes into view
//! <len> 35 36 <entity> <reason u8> ...                                     it leaves (04: taken / gone)
//! <len> 3a 36 <entity> <actor> <u8> ... 23 c5 9a 25                         an interaction ends: a cube opened
//! <len> 1e 56 01 <source u32> <x f32> <y f32> <z f32> ...                  loot dropped by `source`
//! ```
//!
//! - Opening a cube is the only interaction seen ending in `23 c5 9a 25` (all three cube openings;
//!   none of the 70+ other interactions in the same captures). Its loot drop names the cube and
//!   where it stood, so an opening is placed even when the cube came into view before the meter ran.
//! - A cube is an ordinary object to the game: `34 36` with a code. The code of a cube seen opened
//!   is learned (`codes`); from then on, an object with that code coming into view is a cube nearby.
//!   Whether every cube shares one code is not known yet (one seen: 1301199), so codes are learned,
//!   never assumed. The player's app keeps them and hands them back at start (`set_codes`).

use parking_lot::Mutex;
use serde::Serialize;
use std::collections::{HashMap, HashSet};

use crate::capture::stream_processor::read_varint;

/// The end of an interaction that opened a cube.
const OPENED: [u8; 4] = [0x23, 0xC5, 0x9A, 0x25];
/// Objects remembered for their code and place: more is a sign of a long session, so start over.
const MAX_OBJECTS: usize = 20_000;
const MAX_OPENED: usize = 50;

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Cube {
    pub entity: i32,
    pub code: u32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    /// When it came into view (unix ms).
    pub seen_ms: i64,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
    /// Its code, when its coming into view was seen.
    pub code: Option<u32>,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    /// Opened by you (else by another player in view).
    pub by_you: bool,
    pub at_ms: i64,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Cubes {
    /// Cubes in view now (objects with a learned code).
    pub live: Vec<Cube>,
    /// Cubes opened since the meter started, oldest first.
    pub opened: Vec<Opened>,
    /// The cube codes known (learned now or handed back by the app).
    pub codes: Vec<u32>,
}

#[derive(Default)]
struct State {
    objects: HashMap<i32, (u32, [f32; 3])>,
    codes: HashSet<u32>,
    live: HashMap<i32, Cube>,
    opened: Vec<Opened>,
    /// Opened cubes whose place comes with their loot: entity → (by you, when).
    pending: HashMap<i32, (bool, i64)>,
}

static STATE: Mutex<Option<State>> = Mutex::new(None);

fn with<T>(f: impl FnOnce(&mut State) -> T) -> T {
    f(STATE.lock().get_or_insert_with(State::default))
}

/// The cube codes the app knows from earlier sessions.
pub fn set_codes(codes: &[u32]) {
    with(|s| s.codes.extend(codes.iter().copied()));
}

pub fn snapshot() -> Cubes {
    with(|s| {
        let mut live: Vec<Cube> = s.live.values().copied().collect();
        live.sort_by_key(|c| (c.seen_ms, c.entity));
        let mut codes: Vec<u32> = s.codes.iter().copied().collect();
        codes.sort_unstable();
        Cubes { live, opened: s.opened.clone(), codes }
    })
}

/// Reads one game frame (from `crate::tap`). `me` is your entity id (0 = not known yet).
pub fn observe(frame: &[u8], me: i32, now_ms: i64) {
    with(|s| read(s, frame, me, now_ms));
}

fn f32_at(b: &[u8], at: usize) -> Option<f32> {
    Some(f32::from_le_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

fn xyz_at(b: &[u8], at: usize) -> Option<[f32; 3]> {
    let p = [f32_at(b, at)?, f32_at(b, at + 4)?, f32_at(b, at + 8)?];
    p.iter().all(|v| v.is_finite() && v.abs() < 1_000_000.0).then_some(p)
}

fn varint_at(b: &[u8], at: usize) -> Option<(i32, usize)> {
    let v = read_varint(b, at);
    (v.length > 0).then_some((v.value, at + v.length as usize))
}

fn read(s: &mut State, frame: &[u8], me: i32, now_ms: i64) -> Option<()> {
    let (_, o) = varint_at(frame, 0)?;
    let op = frame.get(o..o + 2)?;
    let body = o + 2;
    match op {
        [0x34, 0x36] => {
            let (entity, at) = varint_at(frame, body)?;
            let code = u32::from_le_bytes(frame.get(at + 2..at + 6)?.try_into().ok()?);
            let [x, y, z] = xyz_at(frame, at + 6)?;
            if s.objects.len() >= MAX_OBJECTS {
                s.objects.clear();
            }
            s.objects.insert(entity, (code, [x, y, z]));
            if s.codes.contains(&code) {
                s.live.insert(entity, Cube { entity, code, x, y, z, seen_ms: now_ms });
            }
        }
        [0x35, 0x36] => {
            let (entity, _) = varint_at(frame, body)?;
            s.live.remove(&entity);
        }
        // A map load (a teleport, an arena, a rift): what was in view is gone, and no `35 36` says so for
        // each (2026-10-26: a cube's popup stayed up inside an arena). Opened cubes stay.
        [0x21, 0x36] => {
            s.live.clear();
            s.objects.clear();
            s.pending.clear();
        }
        [0x3A, 0x36] if frame.ends_with(&OPENED) => {
            let (entity, at) = varint_at(frame, body)?;
            let (actor, _) = varint_at(frame, at)?;
            let by_you = me != 0 && actor == me;
            s.live.remove(&entity);
            match s.objects.get(&entity).copied() {
                Some((code, [x, y, z])) => {
                    s.codes.insert(code);
                    push(s, Opened { code: Some(code), x, y, z, by_you, at_ms: now_ms });
                }
                None => {
                    s.pending.insert(entity, (by_you, now_ms));
                }
            }
        }
        [0x1E, 0x56] if *frame.get(body)? == 1 => {
            let source = i32::from_le_bytes(frame.get(body + 1..body + 5)?.try_into().ok()?);
            if let Some((by_you, at_ms)) = s.pending.remove(&source) {
                let [x, y, z] = xyz_at(frame, body + 5)?;
                push(s, Opened { code: None, x, y, z, by_you, at_ms });
            }
        }
        _ => {}
    }
    Some(())
}

fn push(s: &mut State, o: Opened) {
    s.opened.push(o);
    if s.opened.len() > MAX_OPENED {
        s.opened.remove(0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }
    const ME: i32 = 11453; // `bd 59` in these captures

    // 2026-10-23 20:18: the cube comes into view, is opened by you, drops its loot, is gone.
    const SPAWN: &str = "3d3436c9a8030400cfda13002a650648d8029a4700008cc2000000000074a943010106d31dfc69a101000000000000000000001e9fa826070000";
    const OPEN: &str = "133a36c9a803bd590100000023c59a25";
    const LOOT: &str = "471e560149d400002a650648d8029a4700008cc291840648882d9a4700008cc21e930000d7a85c00418ee91f0500000002f17b020000000e098235fe69a1010000010301";
    const GONE: &str = "0c3536c9a803040300";
    // 19:48: another player opens a cube that was in view before the recording started.
    const OPEN_OTHER: &str = "133a36ceef0298310100000023c59a25";
    const LOOT_OTHER: &str = "471e5601ceb70000c93c30458c6c014700f85f460030274500970147005c6146ae810000e87e5b00418ee91f0500000002329e040000000e09f0d3e269a1010000010301";

    /// 2026-10-26: a cube in view, then an arena (a map load, the one of the 2026-10-23 teleport): no
    /// popup inside it.
    #[test]
    fn a_map_load_clears_the_cubes_in_view() {
        let mut s = State::default();
        s.codes.insert(1301199);
        s.live.insert(7, Cube { entity: 7, code: 1301199, x: 0.0, y: 0.0, z: 0.0, seen_ms: 1 });
        s.objects.insert(7, (1301199, [0.0; 3]));
        let load = hex("3421360300000056040000d4df590000000000d09cd5476fcf38480070944631b3ccc20200000000000000000000000000");
        read(&mut s, &load, 0, 2);
        assert!(s.live.is_empty() && s.objects.is_empty());
    }

    #[test]
    fn a_cube_opened_in_view_teaches_its_code_and_place() {
        let mut s = State::default();
        read(&mut s, &hex(SPAWN), ME, 1);
        assert!(s.live.is_empty(), "not a known cube yet");
        read(&mut s, &hex(OPEN), ME, 2);
        read(&mut s, &hex(LOOT), ME, 3);
        assert_eq!(s.opened.len(), 1, "the loot does not add it twice");
        let o = s.opened[0];
        assert_eq!((o.code, o.x.round(), o.y.round(), o.z.round(), o.by_you, o.at_ms), (Some(1301199), 137621.0, 78854.0, -70.0, true, 2));
        assert!(s.codes.contains(&1301199));
    }

    #[test]
    fn a_known_code_coming_into_view_is_a_cube_nearby_until_it_goes() {
        let mut s = State::default();
        s.codes.insert(1301199);
        read(&mut s, &hex(SPAWN), ME, 7);
        let c = s.live[&54345];
        assert_eq!((c.code, c.x.round(), c.y.round(), c.seen_ms), (1301199, 137621.0, 78854.0, 7));
        read(&mut s, &hex(GONE), ME, 8);
        assert!(s.live.is_empty());
    }

    #[test]
    fn a_cube_opened_by_someone_else_is_placed_by_its_loot() {
        let mut s = State::default();
        read(&mut s, &hex(OPEN_OTHER), ME, 5);
        assert!(s.opened.is_empty(), "the place comes with the loot");
        read(&mut s, &hex(LOOT_OTHER), ME, 6);
        let o = s.opened[0];
        assert_eq!((o.code, o.x.round(), o.y.round(), o.by_you, o.at_ms), (None, 2820.0, 33133.0, false, 5));
    }

    #[test]
    fn other_objects_and_interactions_are_not_cubes() {
        let mut s = State::default();
        s.codes.insert(1301199);
        // A 1300865 object coming into view, and an interaction that ends without the cube mark.
        read(&mut s, &hex("413436c4b0020c0081d9130026ff30482cb6054800b47e460000000000000000010101d5403e5ea10100000000000000000000687cbf8609001682730700"), ME, 1);
        read(&mut s, &hex("133a36f68102c1160000000000000000"), ME, 1);
        assert!(s.live.is_empty() && s.opened.is_empty() && s.pending.is_empty());
        assert_eq!(s.objects[&38980].0, 1300865);
    }
}
