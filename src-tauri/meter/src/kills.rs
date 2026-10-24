//! Your PvP kills and deaths, for the kill history (companion code). A death in the death log
//! (`42 36` flag 3, or a party member's HP dropping to 0) is a kill of yours when your hit on
//! that player is the last one before it, and a death of yours when anyone's is the last on you.
//! The hits are the PvP ledger the arena log uses (`DataStorage::pvp_ledger`: per pair of players,
//! damage, hits, first and last hit), kept since the last map load.
//! The meter never sees a "killed by" record: the last hit is the killing blow as far as it knows.

use std::collections::HashMap;

use serde::Serialize;

use crate::arena::ArenaPlayer;
use crate::combat::data_storage::{PartyMember, PvpHits};
use crate::entity::job_class::JobClass;
use crate::snapshot::english_job;

/// The killing blow is the last hit at most this long before the death record...
const BEFORE_MS: i64 = 10_000;
/// ...or this long after it (its own record can come second).
const AFTER_MS: i64 = 2_000;
/// One death logged twice (the death record and the HP at 0) within this is one death.
const SAME_DEATH_MS: i64 = 3_000;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Kill {
    pub at_ms: i64,
    /// "kill" (you killed them) | "death" (they killed you)
    pub kind: &'static str,
    /// The map of the last map load, if one was seen.
    pub map_id: Option<i32>,
    /// The other player; `dealt` / `taken` are their damage to you / yours to them since the map load.
    pub other: ArenaPlayer,
}

/// The last hitter on `victim` around `at`, if any.
fn killer(hits: &HashMap<(i32, i32), PvpHits>, victim: i32, at: i64) -> Option<i32> {
    hits.iter()
        .filter(|&(&(_, t), h)| t == victim && h.last_ms >= at - BEFORE_MS && h.last_ms <= at + AFTER_MS)
        .max_by_key(|&(&(a, _), h)| (h.last_ms, -a))
        .map(|(&(a, _), _)| a)
}

/// The kills and deaths of `me` among `deaths` (victim, unix ms) after `after_ms`.
pub fn find(
    me: i32,
    deaths: &[(i32, i64, Option<i64>)],
    after_ms: i64,
    hits: &HashMap<(i32, i32), PvpHits>,
    names: &dyn Fn(i32) -> String,
    server: &dyn Fn(&str) -> u16,
    party: &HashMap<String, PartyMember>,
    map_id: Option<i32>,
) -> Vec<Kill> {
    let mut out: Vec<Kill> = Vec::new();
    let mut last_death: HashMap<i32, i64> = HashMap::new();
    for &(victim, at, _) in deaths {
        if at <= after_ms {
            continue;
        }
        if last_death.get(&victim).is_some_and(|&t| at - t < SAME_DEATH_MS) {
            continue;
        }
        last_death.insert(victim, at);
        let Some(by) = killer(hits, victim, at) else { continue };
        let (kind, other) = match (by == me, victim == me) {
            (true, false) => ("kill", victim),
            (false, true) => ("death", by),
            _ => continue,
        };
        out.push(Kill { at_ms: at, kind, map_id, other: player(other, me, hits, names, server, party) });
    }
    out
}

fn player(
    id: i32,
    me: i32,
    hits: &HashMap<(i32, i32), PvpHits>,
    names: &dyn Fn(i32) -> String,
    server: &dyn Fn(&str) -> u16,
    party: &HashMap<String, PartyMember>,
) -> ArenaPlayer {
    let name = names(id);
    let roster = party.get(name.trim());
    let theirs = hits.get(&(id, me));
    let mine = hits.get(&(me, id));
    // Their class from their first player skill on anyone.
    let job = hits
        .iter()
        .filter(|&(&(a, _), _)| a == id)
        .find_map(|(_, h)| JobClass::convert_from_skill(h.skill))
        .map(|j| english_job(j.class_name()))
        .unwrap_or_default();
    ArenaPlayer {
        id,
        server_id: roster.map(|m| m.server_id).filter(|&s| s > 0).unwrap_or_else(|| if name.is_empty() { 0 } else { server(&name) }),
        side: "opponent",
        job,
        dealt: theirs.map_or(0, |h| h.damage),
        taken: mine.map_or(0, |h| h.damage),
        hits: theirs.map_or(0, |h| h.hits),
        deaths: 0,
        level: roster.map(|m| m.level).filter(|&v| v > 0),
        gear_score: roster.map(|m| m.gear_score).filter(|&v| v > 0),
        combat_power: roster.map(|m| m.combat_power).filter(|&v| v > 0),
        name,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hit(damage: i64, first_ms: i64, last_ms: i64) -> PvpHits {
        PvpHits { damage, hits: 1, first_ms, last_ms, skill: 0 }
    }
    fn names(id: i32) -> String {
        match id {
            1 => "Me".into(),
            3 => "Foe".into(),
            4 => "Other".into(),
            _ => String::new(),
        }
    }
    fn server(name: &str) -> u16 {
        if name == "Foe" { 2313 } else { 0 }
    }

    #[test]
    fn your_last_hit_before_their_death_is_your_kill() {
        let hits: HashMap<(i32, i32), PvpHits> =
            [((1, 3), hit(900, 1_000, 9_000)), ((4, 3), hit(300, 1_000, 6_000)), ((3, 1), hit(400, 2_000, 8_000))].into();
        let deaths = [(3, 9_200, None), (3, 9_900, None)]; // logged twice: one death
        let k = find(1, &deaths, 0, &hits, &names, &server, &HashMap::new(), Some(600_001));
        assert_eq!(k.len(), 1);
        assert_eq!((k[0].kind, k[0].at_ms, k[0].map_id), ("kill", 9_200, Some(600_001)));
        let o = &k[0].other;
        assert_eq!((o.id, o.name.as_str(), o.server_id, o.dealt, o.taken), (3, "Foe", 2313, 400, 900));
    }

    #[test]
    fn someone_elses_last_hit_is_not_your_kill_but_theirs_on_you_is_your_death() {
        let hits: HashMap<(i32, i32), PvpHits> =
            [((1, 3), hit(900, 1_000, 5_000)), ((4, 3), hit(300, 1_000, 9_000)), ((3, 1), hit(800, 2_000, 20_000))].into();
        let deaths = [(3, 9_100, None), (1, 20_500, None)];
        let k = find(1, &deaths, 0, &hits, &names, &server, &HashMap::new(), None);
        assert_eq!(k.iter().map(|k| (k.kind, k.other.id)).collect::<Vec<_>>(), [("death", 3)]);
    }

    #[test]
    fn old_deaths_and_deaths_without_a_recent_hit_are_left_out() {
        let hits: HashMap<(i32, i32), PvpHits> = [((1, 3), hit(900, 1_000, 2_000))].into();
        let deaths = [(3, 1_500, None), (3, 60_000, None)];
        assert!(find(1, &deaths, 1_600, &hits, &names, &server, &HashMap::new(), None).is_empty());
        assert_eq!(find(1, &deaths, 0, &hits, &names, &server, &HashMap::new(), None).len(), 1);
    }
}
