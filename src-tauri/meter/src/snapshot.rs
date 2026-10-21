//! The companion's view of a meter update: A2Tools' `DpsData` flattened into what the
//! DPS tab draws, with each player's top skills (which `DpsData` does not serialize).
//! Written for the AION 2 Companion; GPL-3.0 like the rest of this crate.

use serde::Serialize;

use std::collections::HashMap;

use crate::entity::details_context::DetailSkillEntry;
use crate::entity::dps_data::DpsData;
use crate::entity::job_class::JobClass;

const CLASSES: [JobClass; 9] = [
    JobClass::Gladiator, JobClass::Templar, JobClass::Ranger, JobClass::Assassin, JobClass::Sorcerer,
    JobClass::Cleric, JobClass::Elementalist, JobClass::Chanter, JobClass::Fighter,
];

/// The calculator names classes in Korean (`JobClass::class_name`); the global client's English names,
/// as A2Tools' English UI table (`src/data/i18n/ui/en.json`, "classes") has them.
pub fn english_job(job: &str) -> String {
    let name = |c: JobClass| match c {
        JobClass::Gladiator => "Gladiator",
        JobClass::Templar => "Templar",
        JobClass::Ranger => "Ranger",
        JobClass::Assassin => "Assassin",
        JobClass::Sorcerer => "Sorcerer",
        JobClass::Cleric => "Cleric",
        JobClass::Elementalist => "Spiritmaster",
        JobClass::Chanter => "Chanter",
        JobClass::Fighter => "Brawler",
    };
    CLASSES.iter().find(|c| c.class_name() == job).map_or_else(|| job.to_string(), |&c| name(c).to_string())
}

/// How many skills each row carries for the breakdown.
pub const TOP_SKILLS: usize = 12;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SkillRow {
    pub name: String,
    pub damage: i64,
    pub hits: i32,
    pub crit_rate: f64,
    /// Share of this player's damage, 0..1.
    pub share: f64,
    pub dot: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlayerRow {
    pub id: i32,
    /// Empty until the game sends the name (it does on loading screens).
    pub name: String,
    pub job: String,
    pub dps: f64,
    pub damage: f64,
    /// Share of the shown damage, 0..100 (A2Tools' `damage_contribution`).
    pub share: f64,
    pub hps: f64,
    pub heal: f64,
    pub combat_power: i64,
    pub gear_score: i32,
    pub is_you: bool,
    /// You, or a member of your party (the game's party roster).
    pub in_party: bool,
    /// Everyone outside your party on an open-world boss, from the HP it lost.
    pub is_others: bool,
    pub skills: Vec<SkillRow>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub name: String,
    pub is_boss: bool,
    pub max_hp: i64,
    /// Live HP when the game sent it, else -1.
    pub current_hp: i64,
    pub damage_dealt: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Fight {
    pub target: Option<Target>,
    pub target_mode: String,
    pub battle_time_ms: i64,
    pub rows: Vec<PlayerRow>,
}

impl Fight {
    pub fn from_dps(d: &DpsData) -> Self {
        let mut rows: Vec<PlayerRow> = d
            .map
            .iter()
            // Party members who did nothing (roster placeholders) are not rows.
            .filter(|(_, p)| p.amount > 0.0 || p.heal_amount > 0.0)
            .map(|(&id, p)| {
                let known = !p.nickname.is_empty() && p.nickname != id.to_string();
                PlayerRow {
                    id,
                    name: if known { p.nickname.clone() } else { String::new() },
                    job: english_job(&p.job),
                    dps: p.dps,
                    damage: p.amount,
                    share: p.damage_contribution,
                    hps: p.hps,
                    heal: p.heal_amount,
                    combat_power: p.combat_power,
                    gear_score: p.gear_score,
                    is_you: d.local_player_id == Some(id as i64),
                    in_party: d.local_player_id == Some(id as i64),
                    is_others: p.is_others,
                    skills: Vec::new(),
                }
            })
            .collect();
        rows.sort_by(|a, b| b.damage.total_cmp(&a.damage).then(a.id.cmp(&b.id)));
        let target = (d.target_id != 0 || !d.target_name.is_empty()).then(|| Target {
            name: d.target_name.clone(),
            is_boss: d.target_is_boss,
            max_hp: d.target_max_hp,
            current_hp: d.target_current_hp,
            damage_dealt: d.target_total_damage,
        });
        Fight { target, target_mode: d.target_mode.clone(), battle_time_ms: d.battle_time, rows }
    }

    /// Marks the rows of your party, given the names on the game's party roster.
    pub fn mark_party<'a>(&mut self, members: impl IntoIterator<Item = &'a String>) {
        let names: std::collections::HashSet<&str> = members.into_iter().map(String::as_str).collect();
        for r in &mut self.rows {
            r.in_party = r.is_you || (!r.name.is_empty() && names.contains(r.name.as_str()));
        }
    }

    /// Keeps only you and your party, with each share of the party's damage.
    pub fn keep_party(&mut self) {
        self.rows.retain(|r| r.in_party && !r.is_others);
        let total: f64 = self.rows.iter().map(|r| r.damage).sum();
        for r in &mut self.rows {
            r.share = if total > 0.0 { r.damage / total * 100.0 } else { 0.0 };
        }
    }

    /// Fills the skill breakdown of the rows named in `entries` (the calculator's per-skill details,
    /// one list per target): summed per skill over the targets, biggest first, top `TOP_SKILLS`.
    pub fn attach_skills(&mut self, entries: &[DetailSkillEntry]) {
        let mut by: HashMap<(i32, i32, bool), (String, i64, i32, i32)> = HashMap::new();
        for e in entries {
            let v = by.entry((e.actor_id, e.code, e.is_dot)).or_insert_with(|| (e.name.clone(), 0, 0, 0));
            v.1 += e.dmg as i64;
            v.2 += e.time;
            v.3 += e.crit;
        }
        for row in &mut self.rows {
            let mut skills: Vec<SkillRow> = by
                .iter()
                .filter(|((actor, _, _), v)| *actor == row.id && v.1 > 0)
                .map(|(&(_, code, dot), (name, dmg, hits, crit))| SkillRow {
                    name: if name.is_empty() { format!("#{code}") } else { name.clone() },
                    damage: *dmg,
                    hits: *hits,
                    crit_rate: if *hits > 0 && !dot { *crit as f64 / *hits as f64 } else { 0.0 },
                    share: if row.damage > 0.0 { *dmg as f64 / row.damage } else { 0.0 },
                    dot,
                })
                .collect();
            skills.sort_by(|a, b| b.damage.cmp(&a.damage).then_with(|| a.name.cmp(&b.name)));
            skills.truncate(TOP_SKILLS);
            if !skills.is_empty() {
                row.skills = skills;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entity::personal_data::PersonalData;

    fn entry(actor_id: i32, code: i32, name: &str, dmg: i32, time: i32, crit: i32, is_dot: bool) -> DetailSkillEntry {
        serde_json::from_value(serde_json::json!({
            "actorId": actor_id, "code": code, "name": name, "time": time, "dmg": dmg, "multiHitCount": 0,
            "multiHitDamage": 0, "crit": crit, "parry": 0, "back": 0, "perfect": 0, "double": 0, "regen": 0, "isDot": is_dot
        }))
        .unwrap()
    }

    fn dps() -> DpsData {
        let mut d = DpsData::new();
        d.local_player_id = Some(7);
        d.target_id = 99;
        d.target_name = "Training Scarecrow".into();
        d.battle_time = 12_000;
        let mut me = PersonalData::with_job("7".into(), "검성".into()); // name not sent yet: the id
        me.amount = 300.0;
        let mut other = PersonalData::with_job("Them".into(), "정령성".into());
        other.amount = 500.0;
        d.map.insert(7, me);
        d.map.insert(8, other);
        d.map.insert(9, PersonalData::new("Idle".into())); // roster placeholder
        d
    }

    #[test]
    fn rows_sorted_by_damage_with_english_classes_and_no_placeholders() {
        let f = Fight::from_dps(&dps());
        let rows: Vec<_> = f.rows.iter().map(|r| (r.name.as_str(), r.job.as_str(), r.is_you)).collect();
        assert_eq!(rows, [("Them", "Spiritmaster", false), ("", "Gladiator", true)]);
        assert_eq!((f.target.unwrap().name.as_str(), f.battle_time_ms), ("Training Scarecrow", 12_000));
    }

    #[test]
    fn skills_are_summed_over_targets_per_row() {
        let mut f = Fight::from_dps(&dps());
        f.attach_skills(&[
            entry(7, 1, "Slash", 120, 2, 1, false),
            entry(7, 1, "Slash", 80, 2, 0, false), // same skill on a second target
            entry(7, 2, "", 100, 5, 0, true),
            entry(8, 3, "Fire", 500, 1, 1, false),
        ]);
        let me = f.rows.iter().find(|r| r.id == 7).unwrap();
        assert_eq!(me.skills.len(), 2);
        assert_eq!((me.skills[0].name.as_str(), me.skills[0].damage, me.skills[0].hits, me.skills[0].crit_rate), ("Slash", 200, 4, 0.25));
        assert_eq!((me.skills[1].name.as_str(), me.skills[1].dot, me.skills[1].crit_rate), ("#2", true, 0.0));
        assert!((me.skills[0].share - 2.0 / 3.0).abs() < 1e-9);
        assert_eq!(f.rows.iter().find(|r| r.id == 8).unwrap().skills[0].name, "Fire");
    }

    #[test]
    fn party_only_keeps_you_and_members_and_reshares() {
        let mut d = dps();
        let mut stranger = PersonalData::new("Stranger".into());
        stranger.amount = 200.0;
        d.map.insert(10, stranger);
        let mut f = Fight::from_dps(&d);
        f.mark_party([&"Them".to_string()]);
        assert_eq!(f.rows.iter().filter(|r| r.in_party).count(), 2);
        f.keep_party();
        let rows: Vec<_> = f.rows.iter().map(|r| (r.id, r.share)).collect();
        assert_eq!(rows, [(8, 62.5), (7, 37.5)]);
    }

    #[test]
    fn unknown_job_text_is_kept() {
        assert_eq!(english_job(""), "");
        assert_eq!(english_job("권성"), "Brawler");
    }

    #[test]
    fn no_target_without_one() {
        assert_eq!(Fight::from_dps(&DpsData::new()).target, None);
    }
}
