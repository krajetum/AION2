//! Your gathering (companion code): what you gathered, how many, and where, for the Map page's gathering spots.
//! From the packet recording of 2026-11-21 17:4x (six gathers: Ohkra, Calendula, Fresh Calendula; the items
//! checked against the inventory changes `1b 56` of the same moments):
//!
//! ```text
//! <len> 34 36 <node varint> <kind u16> <code u32> <x y z f32> ...   an object comes into view (`cubes.rs`): the node
//! <len> 33 8d <flag u8> 3a <node varint> <item u32> <amount u32> ... the gather's result: item and amount
//! <len> 34 8d <gatherer varint> <flag u8> 3a <node varint>          who gathered that node (right after, same frame batch)
//! ```
//!
//! - Every gather of the player sent `33 8d` then `34 8d` with the player's id; the item and amount are the ones the
//!   inventory gained. `flag` is the same in both (1 or 0, meaning unknown).
//! - The node's place is its `34 36` when it came into view while the meter ran (one of the five nodes here);
//!   else your own position at the gather (you stand at the node: a few metres off).
//! - The game data here has no item names: the app names the codes (its recipes table has the materials).

use parking_lot::Mutex;
use serde::Serialize;
use std::collections::{HashMap, VecDeque};

use crate::capture::stream_processor::read_varint;

const MAX_NODES: usize = 2_000;
const MAX_GATHERS: usize = 300;
/// The `34 8d` of a `33 8d` comes within this.
const CONFIRM_WITHIN_MS: i64 = 2_000;

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Gather {
    /// The node's object code, when its `34 36` was seen (the same for every node of one kind).
    pub node: Option<u32>,
    pub item: u32,
    pub amount: u32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    /// True when the place is the node's own; false = your position at the gather.
    pub exact: bool,
    pub map_id: Option<i32>,
    pub at_ms: i64,
}

#[derive(Default)]
struct State {
    nodes: HashMap<i32, (u32, [f32; 3])>,
    pending: VecDeque<(i32, u32, u32, i64)>, // node, item, amount, when
    gathers: VecDeque<Gather>,
}

static STATE: Mutex<Option<State>> = Mutex::new(None);

fn with<T>(f: impl FnOnce(&mut State) -> T) -> T {
    f(STATE.lock().get_or_insert_with(State::default))
}

pub fn snapshot() -> Vec<Gather> {
    with(|s| s.gathers.iter().copied().collect())
}

/// The map found later (`position.rs`, as for `souls::fill_map`) for the gathers read without one.
pub fn fill_map(id: i32) {
    with(|s| s.gathers.iter_mut().filter(|g| g.map_id.is_none()).for_each(|g| g.map_id = Some(id)));
}

pub fn reset() {
    *STATE.lock() = None;
}

pub fn observe(frame: &[u8], now_ms: i64) {
    let me = crate::position::me();
    let pos = crate::position::latest();
    let here = pos.map(|p| ([p.x, p.y, p.z], p.map_id));
    with(|s| read(s, frame, me, here, now_ms));
}

fn u32_at(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(b.get(at..at + 4)?.try_into().ok()?))
}
fn f32_at(b: &[u8], at: usize) -> Option<f32> {
    Some(f32::from_le_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

/// `here` = your position and map at this frame, if known.
fn read(s: &mut State, frame: &[u8], me: i32, here: Option<([f32; 3], Option<i32>)>, now_ms: i64) -> Option<()> {
    let len = read_varint(frame, 0);
    if len.length <= 0 {
        return None;
    }
    let body = len.length as usize + 2;
    match frame.get(body - 2..body)? {
        [0x34, 0x36] => {
            let node = read_varint(frame, body);
            if node.length <= 0 {
                return None;
            }
            let at = body + node.length as usize + 2;
            let code = u32_at(frame, at)?;
            let p = [f32_at(frame, at + 4)?, f32_at(frame, at + 8)?, f32_at(frame, at + 12)?];
            if !p.iter().all(|v| v.is_finite() && v.abs() < 1_000_000.0) {
                return None;
            }
            if s.nodes.len() >= MAX_NODES {
                s.nodes.clear();
            }
            s.nodes.insert(node.value, (code, p));
        }
        [0x33, 0x8D] => {
            if *frame.get(body + 1)? != 0x3A {
                return None;
            }
            let node = read_varint(frame, body + 2);
            if node.length <= 0 {
                return None;
            }
            let at = body + 2 + node.length as usize;
            let (item, amount) = (u32_at(frame, at)?, u32_at(frame, at + 4)?);
            if item == 0 || !(1..=1_000).contains(&amount) {
                return None;
            }
            s.pending.retain(|p| now_ms - p.3 <= CONFIRM_WITHIN_MS && p.0 != node.value);
            s.pending.push_back((node.value, item, amount, now_ms));
        }
        [0x34, 0x8D] => {
            let who = read_varint(frame, body);
            // Only the gatherer gets the `33 8d` paired below; while the meter doesn't know you yet (started in game, no self
            // record seen) the pair alone says it was you.
            if who.length <= 0 || (me != 0 && who.value != me) {
                return None;
            }
            let at = body + who.length as usize;
            if *frame.get(at + 1)? != 0x3A {
                return None;
            }
            let node = read_varint(frame, at + 2);
            if node.length <= 0 {
                return None;
            }
            let i = s.pending.iter().position(|p| p.0 == node.value && now_ms - p.3 <= CONFIRM_WITHIN_MS)?;
            let (_, item, amount, _) = s.pending.remove(i)?;
            let seen = s.nodes.get(&node.value).copied();
            let (p, exact) = match (seen, here) {
                (Some((_, p)), _) => (p, true),
                (None, Some((p, _))) => (p, false),
                (None, None) => return None,
            };
            if s.gathers.len() >= MAX_GATHERS {
                s.gathers.pop_front();
            }
            let map_id = here.and_then(|h| h.1);
            s.gathers.push_back(Gather { node: seen.map(|n| n.0), item, amount, x: p[0], y: p[1], z: p[2], exact, map_id, at_ms: now_ms });
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
    const ME: i32 = 7679; // `ff 3b` in the recording
    const HERE: Option<([f32; 3], Option<i32>)> = Some(([-181900.0, -54800.0, 34200.0], Some(1110)));

    #[test]
    fn a_gather_of_a_node_seen_takes_its_place() {
        let mut s = State::default();
        // Node 33261 (`ed 83 02`) comes into view (30.6 s), then you gather Ohkra ×1 from it (51.7 s).
        read(&mut s, &hex("3d3436ed83020400dda6170040ec34c800cf5dc700360a470000000000000000010101385fd0fea10100000000000000000000dff7072d070000"), ME, HERE, 0);
        read(&mut s, &hex("1f338d003aed8302f23c662401000000000000000000000000000000"), ME, HERE, 100);
        read(&mut s, &hex("0d348dff3b003aed8302"), ME, HERE, 100);
        let g = s.gathers.back().unwrap();
        assert_eq!((g.node, g.item, g.amount, g.exact, g.map_id), (Some(0x17a6dd), 610680050, 1, true, Some(1110)));
        assert_eq!((g.x.round(), g.y.round(), g.z.round()), (-185265.0, -56783.0, 35382.0));
    }

    #[test]
    fn a_gather_of_a_node_not_seen_takes_your_place() {
        let mut s = State::default();
        // Ohkra ×3 from node 18853 (`a5 93 01`), which came into view before the recording.
        read(&mut s, &hex("1f338d013aa59301f23c662403000000000000000000000000000000"), ME, HERE, 0);
        read(&mut s, &hex("0d348dff3b013aa59301"), ME, HERE, 1);
        let g = s.gathers.back().unwrap();
        assert_eq!((g.node, g.item, g.amount, g.exact), (None, 610680050, 3, false));
        assert_eq!(g.x, -181900.0);
    }

    #[test]
    fn someone_elses_gather_or_a_lone_result_is_not_yours() {
        let mut s = State::default();
        read(&mut s, &hex("1f338d013aa59301f23c662403000000000000000000000000000000"), ME, HERE, 0);
        read(&mut s, &hex("0d348d8b29013aa59301"), ME, HERE, 1); // another player's id
        read(&mut s, &hex("0d348dff3b013acc8803"), ME, HERE, 1); // another node
        assert!(s.gathers.is_empty());
        read(&mut s, &hex("0d348dff3b013aa59301"), ME, HERE, 5_000); // too late
        assert!(s.gathers.is_empty());
    }

    #[test]
    fn while_you_are_not_known_the_pair_says_it_was_you() {
        let mut s = State::default();
        read(&mut s, &hex("1f338d013aa59301f23c662403000000000000000000000000000000"), 0, HERE, 0);
        read(&mut s, &hex("0d348dff3b013aa59301"), 0, HERE, 1);
        assert_eq!(s.gathers.len(), 1);
    }
}
