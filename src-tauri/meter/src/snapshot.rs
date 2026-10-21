//! The companion's view of a meter update: A2Tools' `DpsData` flattened into what the
//! DPS tab draws, with each player's top skills (which `DpsData` does not serialize).
//! Written for the AION 2 Companion; GPL-3.0 like the rest of this crate.

use serde::Serialize;

use crate::entity::dps_data::DpsData;

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
            .map(|(&id, p)| {
                let mut skills: Vec<SkillRow> = p
                    .analyzed_data
                    .values()
                    .filter_map(|s| {
                        let damage = s.damage_amount as i64 + s.dot_damage_amount as i64;
                        (damage > 0).then(|| SkillRow {
                            name: if s.skill_name.is_empty() { format!("#{}", s.skill_code) } else { s.skill_name.clone() },
                            damage,
                            hits: s.times + s.dot_times,
                            crit_rate: if s.times > 0 { s.crit_times as f64 / s.times as f64 } else { 0.0 },
                            share: if p.amount > 0.0 { damage as f64 / p.amount } else { 0.0 },
                            dot: s.times == 0 && s.dot_times > 0,
                        })
                    })
                    .collect();
                skills.sort_by(|a, b| b.damage.cmp(&a.damage));
                skills.truncate(TOP_SKILLS);
                PlayerRow {
                    id,
                    name: p.nickname.clone(),
                    job: p.job.clone(),
                    dps: p.dps,
                    damage: p.amount,
                    share: p.damage_contribution,
                    hps: p.hps,
                    heal: p.heal_amount,
                    combat_power: p.combat_power,
                    gear_score: p.gear_score,
                    is_you: d.local_player_id == Some(id as i64),
                    is_others: p.is_others,
                    skills,
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entity::analyzed_skill::AnalyzedSkill;
    use crate::entity::personal_data::PersonalData;

    #[test]
    fn rows_are_sorted_by_damage_with_top_skills() {
        let mut d = DpsData::new();
        d.local_player_id = Some(7);
        d.target_id = 99;
        d.target_name = "Training Scarecrow".into();
        d.battle_time = 12_000;
        let mut me = PersonalData::with_job("Me".into(), "Gladiator".into());
        me.amount = 300.0;
        let mut a = AnalyzedSkill::new(1, "Slash".into());
        a.damage_amount = 200;
        a.times = 4;
        a.crit_times = 1;
        let mut b = AnalyzedSkill::new(2, String::new());
        b.dot_damage_amount = 100;
        b.dot_times = 5;
        me.analyzed_data.insert(1, a);
        me.analyzed_data.insert(2, b);
        let mut other = PersonalData::new("Them".into());
        other.amount = 500.0;
        d.map.insert(7, me);
        d.map.insert(8, other);

        let f = Fight::from_dps(&d);
        assert_eq!(f.rows.iter().map(|r| r.name.as_str()).collect::<Vec<_>>(), ["Them", "Me"]);
        let me = &f.rows[1];
        assert!(me.is_you && !f.rows[0].is_you);
        assert_eq!(me.skills.len(), 2);
        assert_eq!((me.skills[0].name.as_str(), me.skills[0].damage, me.skills[0].crit_rate), ("Slash", 200, 0.25));
        assert_eq!((me.skills[1].name.as_str(), me.skills[1].dot, me.skills[1].hits), ("#2", true, 5));
        assert!((me.skills[0].share - 2.0 / 3.0).abs() < 1e-9);
        let t = f.target.unwrap();
        assert_eq!((t.name.as_str(), f.battle_time_ms), ("Training Scarecrow", 12_000));
    }

    #[test]
    fn no_target_without_one() {
        assert_eq!(Fight::from_dps(&DpsData::new()).target, None);
    }
}
