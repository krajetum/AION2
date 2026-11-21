//! Your Genus Insight (companion code): the lines each insight rolled, as the game sends them on entering the world,
//! at the end of the pet collection (`00 90`, `pets.rs`), and which preset you switch to. From the recording of
//! 2026-11-21 15:4x (login), checked line by line against the player's five insight pages (video of the same day):
//!
//! ```text
//! <count u8>                                  insights (5)
//! count x  <id u8> <id u8> <level u8> 11 bytes  2 Cogni, 3 Fera, 4 Natura, 5 Varian, 6 Special; level 10 = max
//!          <presets u8>                       3
//!          presets x  <preset u8> <lines u8>  preset 1-3, 9 lines
//!                     lines x  <slot u8> <grade u8> <stat u16> <value u16> 6 bytes
//! ```
//!
//! - Now and then one more byte sits before a line or a preset (`fb`, `ef`, `ab`, `aa`…, never 0-9): skipped.
//! - `stat` = the ids of the stat record (`4a 36`): 19 Attack Bonus, 104 Accuracy Bonus, 196 HP increase (value in
//!   hundredths of a %)…; the names are the app's (`src/domain/genus.ts`). A line not rolled yet has stat 0.
//! - `grade` 1-5 = the line's colour in game (white, green, blue, gold, orange).
//! - The preset in use: `90 e2` `00 00 <kind> <preset> 00 00` when the player switches (kind 6 = Genus, 0 = gear,
//!   1 = arcana); nothing at login, so until a switch the app takes the only preset with lines.

use parking_lot::Mutex;
use serde::Serialize;

use crate::capture::stream_processor::read_varint;

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Line {
    pub slot: u8,
    pub grade: u8,
    pub stat: u16,
    pub value: u16,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Insight {
    pub id: u8,
    pub level: u8,
    /// Preset 1 first; each with its rolled lines only.
    pub presets: Vec<Vec<Line>>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Genus {
    pub insights: Vec<Insight>,
    /// The preset switched to since (1-3), None until a switch.
    pub preset: Option<u8>,
    /// When the insights were read (unix ms).
    pub at_ms: i64,
}

static LAST: Mutex<Option<Genus>> = Mutex::new(None);

pub fn latest() -> Option<Genus> {
    LAST.lock().clone()
}

/// Reads one game frame (its length varint, 2-byte type, body).
pub fn observe(frame: &[u8], now_ms: i64) {
    if let Some(p) = preset_switch(frame) {
        if let Some(g) = LAST.lock().as_mut() {
            g.preset = Some(p);
        }
        return;
    }
    if let Some(insights) = read(frame) {
        let mut last = LAST.lock();
        let preset = last.as_ref().and_then(|g| g.preset);
        *last = Some(Genus { insights, preset, at_ms: now_ms });
    }
}

fn body(frame: &[u8], kind: [u8; 2]) -> Option<usize> {
    let len = read_varint(frame, 0);
    if len.length <= 0 {
        return None;
    }
    let body = len.length as usize + 2;
    (frame.get(body - 2..body)? == kind).then_some(body)
}

/// `90 e2 00 00 06 <preset> 00 00`: the Genus preset switched to.
fn preset_switch(frame: &[u8]) -> Option<u8> {
    let at = body(frame, [0x90, 0xe2])?;
    let b = frame.get(at..at + 6)?;
    (b[0] == 0 && b[1] == 0 && b[2] == 6 && (1..=3).contains(&b[3])).then_some(b[3])
}

fn read(frame: &[u8]) -> Option<Vec<Insight>> {
    let start = body(frame, [0x00, 0x90])?;
    // The insights end the record: the first place where all of them read, up to the last byte or two.
    (start..frame.len().saturating_sub(40)).find_map(|at| parse(frame, at).filter(|(_, end)| frame.len() - end <= 2).map(|(v, _)| v))
}

/// The insights from `at` (their count), and where they end; None unless every one reads.
fn parse(b: &[u8], mut at: usize) -> Option<(Vec<Insight>, usize)> {
    let n = *b.get(at)?;
    if !(1..=9).contains(&n) {
        return None;
    }
    at += 1;
    let mut out = Vec::with_capacity(n as usize);
    for _ in 0..n {
        if b.get(at)? != b.get(at + 1)? {
            at += 1; // a flag byte
        }
        let (id, again, level) = (*b.get(at)?, *b.get(at + 1)?, *b.get(at + 2)?);
        if id != again || !(1..=20).contains(&id) || !(1..=10).contains(&level) {
            return None;
        }
        at += 14;
        let presets = *b.get(at)?;
        if !(1..=3).contains(&presets) {
            return None;
        }
        at += 1;
        let mut lists = Vec::with_capacity(presets as usize);
        for p in 1..=presets {
            if *b.get(at)? != p {
                at += 1;
            }
            let (no, count) = (*b.get(at)?, *b.get(at + 1)?);
            if no != p || !(1..=12).contains(&count) {
                return None;
            }
            at += 2;
            let mut lines = Vec::new();
            for slot in 0..count {
                if *b.get(at)? != slot {
                    at += 1;
                }
                let s = b.get(at..at + 12)?;
                if s[0] != slot || s[1] > 6 {
                    return None;
                }
                let stat = u16::from_le_bytes([s[2], s[3]]);
                let value = u16::from_le_bytes([s[4], s[5]]);
                if stat != 0 {
                    lines.push(Line { slot, grade: s[1], stat, value });
                }
                at += 12;
            }
            lists.push(lines);
        }
        out.push(Insight { id, level, presets: lists });
    }
    Some((out, at))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        let s = s.trim();
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }

    fn l(slot: u8, grade: u8, stat: u16, value: u16) -> Line {
        Line { slot, grade, stat, value }
    }

    /// The `00 90` at login of 2026-11-21 (5,813 bytes), as the player's five insight pages showed them.
    #[test]
    fn the_insights_read_as_the_pages_showed_them() {
        let g = read(&hex(include_str!("genus_collection.hex"))).unwrap();
        assert_eq!(g.iter().map(|i| (i.id, i.level, i.presets.len())).collect::<Vec<_>>(), vec![(2, 10, 3), (3, 10, 3), (4, 10, 3), (5, 10, 3), (6, 10, 3)]);
        // Cogni: Attack Bonus 9, Critical Damage Defense 156, Accuracy Bonus 15, PvE Damage Boost 2.4%, Max Attack 18,
        // Power Shard Damage Bonus 8, Damage Tolerance 1.3%, HP increase 0.8%, Critical Hit 12.
        assert_eq!(
            g[0].presets[0],
            vec![l(0, 5, 19, 9), l(1, 4, 41, 156), l(2, 4, 104, 15), l(3, 4, 379, 237), l(4, 5, 31, 18), l(5, 5, 69, 8), l(6, 4, 70, 127), l(7, 4, 196, 82), l(8, 4, 128, 12)]
        );
        // Special: Max Attack 11 (blue), Back Defense 104 (orange), …, Defense Bonus 53 (green), Accuracy Bonus 26.
        assert_eq!(g[4].presets[0][1], l(1, 5, 99, 104));
        assert_eq!(g[4].presets[0][7], l(7, 2, 52, 53));
        assert!(g.iter().all(|i| i.presets[1].is_empty() && i.presets[2].is_empty()));
    }

    #[test]
    fn a_preset_switch_reads() {
        assert_eq!(preset_switch(&hex("0c90e2000006030000")), Some(3));
        assert_eq!(preset_switch(&hex("0c90e2000001030000")), None); // the gear's
        assert_eq!(read(&hex("0f0d90011504000001000000")), None);
        assert_eq!(read(&[]), None);
    }

    /// The collection of 2026-10-26 (another character, insights at level 7, 7 lines each) reads too.
    #[test]
    fn an_earlier_collection_reads_too() {
        let g = read(&hex(include_str!("pets_collection.hex"))).unwrap();
        assert_eq!(g.iter().map(|i| (i.id, i.level, i.presets[0].len())).collect::<Vec<_>>(), vec![(2, 7, 7), (3, 7, 7), (4, 7, 7), (5, 7, 7), (6, 7, 7)]);
        assert_eq!(g[4].presets[0][3], l(3, 3, 104, 16));
    }
}
