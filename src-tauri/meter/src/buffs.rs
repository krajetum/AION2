//! Companion code: each player's buffs in a boss fight with their uptime (the DPS Log's Buffs).
//! From A2Tools' fight buff tracks (`combat::fight_buffs`), named by A2Tools' `i18n/abnormals` table
//! (game data: buffs, scrolls, food, elixirs, debuffs on the player).

use std::collections::HashMap;
use std::sync::OnceLock;

use serde::Serialize;

use crate::combat::fight_buffs::BuffTrack;

/// Buffs kept per player: the longest up first.
pub const MAX_BUFFS: usize = 24;
/// Shorter than this share of the fight: left out (a proc that came once).
pub const MIN_SHARE: f64 = 0.02;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuffUp {
    /// The `SkillAbnormal` id (the first one seen under this name).
    pub id: u32,
    pub name: String,
    /// Time on within the fight, ms.
    pub up_ms: i64,
    /// Put on by the player themself (else by someone else, or not named).
    pub own: bool,
    /// "scroll", "food", "potion" or "buff": the game's consumables by their id range (`kind_of`).
    pub kind: &'static str,
}

/// A consumable's kind by its `SkillAbnormal` id range, as the game's table has them (A2Tools' `i18n/abnormals`, 2026-11-21):
/// 221xxxxx scrolls, 211xxxxx drinks and 216xxxxx dishes (food), 201xxxxx potions and flasks; else a buff.
pub fn kind_of(id: u32) -> &'static str {
    match id / 100_000 {
        221 => "scroll",
        211 | 216 => "food",
        201 => "potion",
        _ => "buff",
    }
}

/// Scrolls and food first in a player's list, then the rest by time up.
fn rank(kind: &str) -> u8 {
    match kind { "scroll" | "food" => 0, _ => 1 }
}

fn names() -> &'static HashMap<u32, String> {
    static NAMES: OnceLock<HashMap<u32, String>> = OnceLock::new();
    NAMES.get_or_init(|| {
        let raw: HashMap<String, String> = serde_json::from_str(include_str!("../data/i18n/abnormals/en.json")).unwrap_or_default();
        raw.into_iter().filter_map(|(k, v)| Some((k.parse().ok()?, v))).collect()
    })
}

pub fn name_of(id: u32) -> Option<&'static str> {
    names().get(&id).map(|s| s.as_str())
}

/// Per player (`on`, not a summon, not the target), their timed buffs by name with the time they were up:
/// one name from several casters or ids counts the longest (they overlap), up at least MIN_SHARE of `duration_ms`.
/// Passives (on all fight, no timer) are left out, they are always 100%, except scrolls and food:
/// one eaten or read before the meter saw it comes as a passive, and it was up the whole fight.
pub fn by_player(tracks: &[BuffTrack], target_id: i32, duration_ms: i64) -> HashMap<i32, Vec<BuffUp>> {
    let mut by: HashMap<i32, HashMap<String, BuffUp>> = HashMap::new();
    for t in tracks.iter().filter(|t| !t.summon && t.on != target_id) {
        let kind = kind_of(t.id);
        if t.passive && rank(kind) != 0 {
            continue;
        }
        let up = if t.passive { duration_ms.max(0) } else { t.up.min(duration_ms.max(0)) };
        if up <= 0 {
            continue;
        }
        let name = name_of(t.id).map(str::to_string).unwrap_or_else(|| format!("Buff #{}", t.id));
        let e = by.entry(t.on).or_default().entry(name.clone()).or_insert(BuffUp { id: t.id, name, up_ms: 0, own: false, kind });
        if up > e.up_ms {
            e.up_ms = up;
            e.id = t.id;
            e.own = t.by == t.on;
        }
    }
    let min = (duration_ms as f64 * MIN_SHARE) as i64;
    by.into_iter().map(|(on, m)| {
        let mut v: Vec<_> = m.into_values().filter(|b| b.up_ms >= min.max(1)).collect();
        v.sort_by(|a, b| rank(a.kind).cmp(&rank(b.kind)).then(b.up_ms.cmp(&a.up_ms)).then(a.name.cmp(&b.name)));
        v.truncate(MAX_BUFFS);
        (on, v)
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(on: i32, id: u32, by: i32, up: i64) -> BuffTrack {
        BuffTrack { on, summon: false, id, by, skill: 0, passive: false, segs: String::new(), up }
    }

    #[test]
    fn kinds_by_id_range() {
        assert_eq!(kind_of(22101071), "scroll");
        assert_eq!(kind_of(21101011), "food");
        assert_eq!(kind_of(21601011), "food");
        assert_eq!(kind_of(20111011), "potion");
        assert_eq!(kind_of(141100071), "buff");
        assert_eq!(name_of(20111011), Some("Life Potion"));
    }

    #[test]
    fn names_come_from_the_game_table() {
        assert_eq!(name_of(22101071), Some("Critical Hit Scroll"));
        assert_eq!(name_of(100), Some("Stun"));
    }

    #[test]
    fn per_player_by_name_longest_kept_short_and_target_and_passive_left_out() {
        let mut passive = t(7, 100, 7, 60_000);
        passive.passive = true;
        let mut food = t(7, 21101011, 7, 0); // a drink from before the meter saw it: up the whole fight
        food.passive = true;
        let mut summon = t(7, 22101051, 7, 60_000);
        summon.summon = true;
        let tracks = [
            t(7, 22101071, 7, 60_000),  // own scroll, the whole fight
            t(7, 22101081, 8, 30_000),  // another name
            t(7, 22101071, 8, 20_000),  // same name from someone else: the longer kept
            t(7, 100, 99, 500),         // under 2%
            t(99, 100, 7, 40_000),      // on the boss: not a player's
            t(8, 4_000_000_000, 7, 9_000), // a name not in the table
            passive, summon, food,
        ];
        let m = by_player(&tracks, 99, 60_000);
        let a: Vec<_> = m[&7].iter().map(|b| (b.name.as_str(), b.up_ms, b.own)).collect();
        assert_eq!(a, [("Critical Hit Scroll", 60_000, true), ("Mela Juice", 60_000, true), ("Superior Critical Hit Scroll", 30_000, false)]);
        assert_eq!(m[&7].iter().map(|b| b.kind).collect::<Vec<_>>(), ["scroll", "food", "scroll"]);
        assert_eq!(m[&8][0].name, "Buff #4000000000");
        assert!(!m.contains_key(&99));
    }
}
