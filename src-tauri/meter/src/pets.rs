//! Your pet collection, as the game sends it on entering the world (companion code). Not on opening the Pets
//! menu: in the recordings of 2026-10-26 11:14 and 12:05 it came once, 4-6 s after the first map load (`21 36`),
//! and never again in 4-7 minutes, the menu opened in the second. From the packet
//! recording of 2026-10-26 12:05, checked against what the player read in the menu (Unstable Spider 55/75,
//! Armadon 39/75, a Lesser Fire Spirit 19/25, no Skama):
//!
//! ```text
//! <len> 00 90 <4 bytes> <count varint> count x (<pet u32> <pet u32> <level u32>)    the pets you own
//!                       <count varint> count x (<pet u32> <soul points u32>)        soul points toward the next level
//!                       ...                                                         (more, not read)
//! ```
//!
//! - 193 pets owned: 127 at level 1, 47 at 2, 19 at 3; points never above 24 at level 1 and 66 at level 2
//!   (next levels at 25 and 75), 0 at level 3. Unstable Spider is pet 1117 (55, level 2: also the pet the
//!   player equipped as a mount, `2f 93`), Armadon 1046 (39, level 2).
//! - The pet number is the soul points' kind (`0d 90`, `souls.rs`): 1016 Slink, 1097 Highland Karnif. A pet
//!   not owned is in neither list. The game sends numbers only: names come from the mobs (the app).

use parking_lot::Mutex;
use serde::Serialize;

use crate::capture::stream_processor::read_varint;

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Pet {
    pub id: u32,
    pub level: u32,
    /// Soul points toward the next level.
    pub points: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub pets: Vec<Pet>,
    /// When it was read (unix ms).
    pub at_ms: i64,
}

static LAST: Mutex<Option<Collection>> = Mutex::new(None);

/// The last collection read, if the Pets menu was opened since the meter started.
pub fn latest() -> Option<Collection> {
    LAST.lock().clone()
}

/// Reads one game frame (its length varint, 2-byte type, body), as the parser hands it on.
pub fn observe(frame: &[u8], now_ms: i64) {
    if let Some(pets) = read(frame) {
        *LAST.lock() = Some(Collection { pets, at_ms: now_ms });
    }
}

fn u32_at(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

fn read(frame: &[u8]) -> Option<Vec<Pet>> {
    let len = read_varint(frame, 0);
    if len.length <= 0 {
        return None;
    }
    let body = len.length as usize + 2;
    if frame.get(body - 2..body)? != [0x00, 0x90] {
        return None;
    }
    let ok_id = |id: u32| (1..1_000_000).contains(&id);
    let owned = read_varint(frame, body + 4);
    if owned.length <= 0 || !(1..=5_000).contains(&owned.value) {
        return None;
    }
    let mut at = body + 4 + owned.length as usize;
    let mut pets = Vec::with_capacity(owned.value as usize);
    for _ in 0..owned.value {
        let (id, again, level) = (u32_at(frame, at)?, u32_at(frame, at + 4)?, u32_at(frame, at + 8)?);
        // The whole list must read as one: the id twice, a level a pet can have.
        if !ok_id(id) || id != again || !(1..=10).contains(&level) {
            return None;
        }
        pets.push(Pet { id, level, points: 0 });
        at += 12;
    }
    let points = read_varint(frame, at);
    if points.length <= 0 || points.value < 0 || points.value > 5_000 {
        return None;
    }
    at += points.length as usize;
    for _ in 0..points.value {
        let (id, n) = (u32_at(frame, at)?, u32_at(frame, at + 4)?);
        if let Some(p) = pets.iter_mut().find(|p| p.id == id) {
            p.points = n;
        }
        at += 8;
    }
    Some(pets)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        let s = s.trim();
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }

    /// The `00 90` of 2026-10-26 12:05 (5,050 bytes), as the player's Pets menu opened.
    #[test]
    fn the_collection_reads_as_the_menu_showed_it() {
        let pets = read(&hex(include_str!("pets_collection.hex"))).unwrap();
        assert_eq!(pets.len(), 193);
        let get = |id: u32| *pets.iter().find(|p| p.id == id).unwrap();
        assert_eq!(get(1117), Pet { id: 1117, level: 2, points: 55 }); // Unstable Spider, 55/75
        assert_eq!(get(1046), Pet { id: 1046, level: 2, points: 39 }); // Armadon, 39/75
        assert_eq!(get(1005), Pet { id: 1005, level: 3, points: 0 });
        let at = |l: u32| pets.iter().filter(|p| p.level == l).count();
        assert_eq!((at(1), at(2), at(3)), (127, 47, 19));
        assert!(pets.iter().all(|p| (p.level == 1 && p.points < 25) || (p.level == 2 && p.points < 75) || (p.level == 3 && p.points == 0)));
    }

    #[test]
    fn other_records_are_not_a_collection() {
        assert_eq!(read(&hex("0f0d90011504000001000000")), None);
        assert_eq!(read(&hex("0a0690b4430200")), None);
        assert_eq!(read(&[]), None);
    }
}
