//! An arena match as the companion logs it: the PvP hits between two map loads (`PvpHits`),
//! split into your side and theirs, with what the game said about each player.
//! Written for the AION 2 Companion; GPL-3.0 like the rest of this crate.

use std::collections::HashMap;

use serde::Serialize;

use crate::combat::data_storage::{PartyMember, PvpHits};
use crate::entity::job_class::JobClass;
use crate::snapshot::english_job;

/// Deaths this long after the last hit still count for the match (the killing blow's own
/// HP record can come after it).
const DEATH_GRACE_MS: i64 = 5_000;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArenaPlayer {
    pub id: i32,
    /// Empty when the game never sent it.
    pub name: String,
    /// "you" | "ally" | "opponent"
    pub side: &'static str,
    pub job: String,
    /// 0 when unknown.
    pub server_id: u16,
    pub dealt: i64,
    pub taken: i64,
    pub hits: i32,
    pub deaths: i32,
    /// Only for you and your party (the roster and your self record). The game sends
    /// opponents' gear in no packet the meter decodes yet.
    pub level: Option<i32>,
    pub gear_score: Option<i32>,
    pub combat_power: Option<i64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArenaMatch {
    /// The instance's map (`21 36`); the UI lets the user name it.
    pub map_id: i32,
    pub start_ms: i64,
    pub end_ms: i64,
    pub players: Vec<ArenaPlayer>,
}

/// The match in `hits`, or None when no hit crossed from your side to theirs. `party` is the
/// roster by name (its members are your side, with their gear); `deaths` the death log.
pub fn build_match(
    map_id: i32,
    hits: &HashMap<(i32, i32), PvpHits>,
    me: Option<i32>,
    names: &HashMap<i32, String>,
    party: &HashMap<String, PartyMember>,
    deaths: &[(i32, i64, Option<i64>)],
) -> Option<ArenaMatch> {
    let name = |id: i32| names.get(&id).cloned().unwrap_or_default();
    let ours = |id: i32| Some(id) == me || names.get(&id).is_some_and(|n| party.contains_key(n.trim()));
    let mut players: HashMap<i32, ArenaPlayer> = HashMap::new();
    let (mut start, mut end) = (i64::MAX, i64::MIN);
    for (&(actor, target), h) in hits {
        // Hits within one side are the heals and buffs the meter takes them for.
        if ours(actor) == ours(target) {
            continue;
        }
        start = start.min(h.first_ms);
        end = end.max(h.last_ms);
        for id in [actor, target] {
            players.entry(id).or_insert_with(|| {
                let n = name(id);
                let roster = party.get(n.trim());
                ArenaPlayer {
                    id,
                    side: if Some(id) == me { "you" } else if ours(id) { "ally" } else { "opponent" },
                    job: String::new(),
                    server_id: roster.map_or(0, |m| m.server_id),
                    dealt: 0,
                    taken: 0,
                    hits: 0,
                    deaths: 0,
                    level: roster.map(|m| m.level).filter(|&v| v > 0),
                    gear_score: roster.map(|m| m.gear_score).filter(|&v| v > 0),
                    combat_power: roster.map(|m| m.combat_power).filter(|&v| v > 0),
                    name: n,
                }
            });
        }
        let a = players.get_mut(&actor)?;
        a.dealt += h.damage;
        a.hits += h.hits;
        if a.job.is_empty() {
            if let Some(job) = JobClass::convert_from_skill(h.skill) {
                a.job = english_job(job.class_name());
            }
        }
        players.get_mut(&target)?.taken += h.damage;
    }
    if players.is_empty() {
        return None;
    }
    for &(id, at, _) in deaths {
        if (start..=end + DEATH_GRACE_MS).contains(&at) {
            if let Some(p) = players.get_mut(&id) {
                p.deaths += 1;
            }
        }
    }
    let rank = |s: &str| ["you", "ally", "opponent"].iter().position(|&x| x == s);
    let mut players: Vec<ArenaPlayer> = players.into_values().collect();
    players.sort_by(|a, b| rank(a.side).cmp(&rank(b.side)).then(b.dealt.cmp(&a.dealt)).then(a.id.cmp(&b.id)));
    Some(ArenaMatch { map_id, start_ms: start, end_ms: end, players })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hit(damage: i64, first_ms: i64, last_ms: i64, skill: i32) -> PvpHits {
        PvpHits { damage, hits: 1, first_ms, last_ms, skill }
    }

    #[test]
    fn splits_sides_and_drops_heals_within_a_side() {
        let names: HashMap<i32, String> =
            [(1, "Me"), (2, "Mate"), (3, "Foe")].into_iter().map(|(i, n)| (i, n.to_string())).collect();
        let party: HashMap<String, PartyMember> = [
            ("Me".to_string(), PartyMember { gear_score: 2000, ..Default::default() }),
            ("Mate".to_string(), PartyMember { level: 45, gear_score: 1900, combat_power: 50_000, server_id: 1304, ..Default::default() }),
        ]
        .into_iter()
        .collect();
        let hits: HashMap<(i32, i32), PvpHits> = [
            ((1, 3), hit(500, 1_000, 9_000, 0)),
            ((3, 1), hit(300, 2_000, 8_000, 0)),
            ((2, 3), hit(200, 3_000, 4_000, 0)),
            ((2, 1), hit(9_999, 1_500, 1_500, 0)), // a heal from the party member
        ]
        .into_iter()
        .collect();
        let deaths = [(3, 9_500, None), (3, 20_000, None)];
        let m = build_match(600_001, &hits, Some(1), &names, &party, &deaths).unwrap();
        assert_eq!((m.start_ms, m.end_ms), (1_000, 9_000));
        let row = |id: i32| m.players.iter().find(|p| p.id == id).unwrap();
        assert_eq!(m.players.iter().map(|p| p.side).collect::<Vec<_>>(), ["you", "ally", "opponent"]);
        assert_eq!((row(1).dealt, row(1).taken), (500, 300));
        assert_eq!((row(3).dealt, row(3).taken, row(3).deaths), (300, 700, 1));
        assert_eq!((row(2).gear_score, row(2).server_id, row(2).level), (Some(1900), 1304, Some(45)));
        assert_eq!(row(3).gear_score, None);
    }

    #[test]
    fn nothing_when_only_one_side_appears() {
        let hits: HashMap<(i32, i32), PvpHits> = [((1, 2), hit(100, 0, 0, 0))].into_iter().collect();
        let party: HashMap<String, PartyMember> = [("B".to_string(), PartyMember::default())].into_iter().collect();
        let names: HashMap<i32, String> = [(2, "B".to_string())].into_iter().collect();
        assert_eq!(build_match(1, &hits, Some(1), &names, &party, &[]), None);
    }
}
