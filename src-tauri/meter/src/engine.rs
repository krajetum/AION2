//! Starts the vendored A2Tools pipeline (capture → dispatcher → storage → calculator)
//! the way A2Tools' `app.rs` does, without its windows, settings, uploads or plugins.
//! Written for the AION 2 Companion; GPL-3.0 like the rest of this crate.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use parking_lot::Mutex;
use serde::Serialize;

use crate::arena::{ArenaMatch, build_match};
use crate::capture::combat_port_detector::CombatPortDetector;
use crate::capture::field_bosses::FIELD_BOSSES;
use crate::capture::pcap_capturer::PcapCapturer;
use crate::combat::capture_dispatcher::CaptureDispatcher;
use crate::combat::data_storage::{DataStorage, is_open_world_map};
use crate::combat::dps_calculator::DpsCalculator;
use crate::combat::ping_tracker::PingTracker;
use crate::i18n::lookup::{NpcLookup, SkillLookup};
use crate::platform;
use crate::snapshot::{Fight, english_job};

/// How often to ask whether the game window is open (it is a window list, not free).
const GAME_CHECK_MS: i64 = 5_000;

/// English names and the DoT list ship inside the binary: no data folder to install.
pub fn load_names() -> (Arc<SkillLookup>, Arc<NpcLookup>) {
    let skills = SkillLookup::new();
    skills.load_from_json(include_str!("../data/i18n/skills/en.json"));
    let npcs = NpcLookup::new();
    npcs.load_from_json(include_str!("../data/i18n/npcs/en.json"));
    (Arc::new(skills), Arc::new(npcs))
}

pub fn dot_skill_ids() -> HashSet<i32> {
    serde_json::from_str::<Vec<i32>>(include_str!("../data/dot_skill_ids.json")).unwrap_or_default().into_iter().collect()
}

pub fn new_storage() -> Arc<DataStorage> {
    let storage = Arc::new(DataStorage::new());
    storage.set_abnormal_stack_limits(crate::capture::abnormal::stack_limits(include_str!("../data/abnormals.json")));
    storage
}

/// What the DPS tab shows: where the capture is, and the current fight.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Update {
    /// "no-capture" | "waiting-game" | "searching" | "connected"
    pub status: &'static str,
    pub message: String,
    pub port: Option<u16>,
    pub device: Option<String>,
    pub ping_ms: Option<i32>,
    pub paused: bool,
    /// Only you and your party (else everyone who hit the target).
    pub party_only: bool,
    /// "damage" | "healing" | "taken": what the rows are ranked by (the overlay follows it too).
    pub view: String,
    pub fight: Fight,
    /// The field bosses on every map the player opened since the meter started.
    pub bosses: Vec<BossTimer>,
    pub odyle: Option<Odyle>,
    /// Who you are playing, once the game has said.
    pub profile: Option<Profile>,
    /// The last arena match, once one has ended (a map load after PvP hits in an instance).
    pub arena: Option<ArenaMatch>,
    /// Where you are, from the last record that said (map loads, teleports, your buffs).
    pub position: Option<crate::position::SelfPosition>,
    /// Hidden cubes in view (learned codes) and opened since the meter started.
    pub cubes: crate::cubes::Cubes,
}

/// A field boss as the map the player opened shows it (`capture::boss_map`).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BossTimer {
    pub map_id: u32,
    /// The game's world-map boss id.
    pub boss_id: u32,
    pub name: String,
    pub up: bool,
    /// Unix ms: since when it is up, or when it returns; 0 when the game gave none.
    pub time_ms: i64,
    /// When the map was read.
    pub seen_ms: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Odyle {
    pub basic: u32,
    pub charged: u32,
    /// The character it is, once the game has said.
    pub owner: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub name: String,
    pub server_id: u16,
    pub job: String,
    pub level: Option<u32>,
    pub gear_score: Option<i32>,
    pub combat_power: Option<i64>,
}

/// The map the PvP hits are on, and the players' names seen while there (a map load hands out new ids).
#[derive(Default)]
struct ArenaWatch {
    zone: u64,
    map: Option<i32>,
    names: HashMap<i32, String>,
    last: Option<ArenaMatch>,
}

pub struct Engine {
    storage: Arc<DataStorage>,
    npcs: Arc<NpcLookup>,
    calc: Mutex<DpsCalculator>,
    /// (boss_maps_since count, the timers it gave)
    bosses: Mutex<(u64, Vec<BossTimer>)>,
    arena: Mutex<ArenaWatch>,
    ports: Arc<CombatPortDetector>,
    ping: Arc<PingTracker>,
    paused: Arc<AtomicBool>,
    party_only: AtomicBool,
    view: Mutex<String>,
    /// Rows whose skill breakdown is open in the UI: only these get per-skill details.
    watched: Mutex<Vec<i32>>,
    capturer: Option<PcapCapturer>,
    capture_error: Option<String>,
    /// (last check ms, game window open)
    game: Mutex<(i64, bool)>,
}

impl Engine {
    /// Loads Npcap/libpcap, opens every adapter and starts parsing. Never fails: without a
    /// capture library the engine still answers, with status "no-capture".
    pub fn start() -> Arc<Self> {
        crate::tap::install();
        let (skills, npcs) = load_names();
        let storage = new_storage();
        let ping = Arc::new(PingTracker::new());
        let ports = Arc::new(CombatPortDetector::new());
        let calc = DpsCalculator::new(storage.clone(), skills.clone(), npcs.clone(), ping.clone());
        let paused = Arc::new(AtomicBool::new(false));
        let (tx, rx) = tokio::sync::mpsc::channel(4096);

        let (capturer, capture_error) = if platform::pcap::library_available() {
            let c = PcapCapturer::new(tx, ports.clone());
            c.start();
            if c.is_running() {
                (Some(c), None)
            } else {
                (None, Some(format!("Could not start the capture. {}", platform::pcap::MISSING_HELP)))
            }
        } else {
            (None, Some(platform::pcap::MISSING_HELP.to_string()))
        };

        let mut dispatcher = CaptureDispatcher::new(storage.clone(), skills, npcs.clone(), ports.clone(), ping.clone());
        dispatcher.set_dot_skill_ids(dot_skill_ids());
        dispatcher.use_suspend_flag(paused.clone());
        std::thread::Builder::new()
            .name("meter-dispatch".into())
            .spawn(move || match tokio::runtime::Builder::new_current_thread().enable_time().build() {
                Ok(rt) => rt.block_on(dispatcher.run(rx)),
                Err(e) => tracing::error!("meter runtime failed: {e}"),
            })
            .ok();

        Arc::new(Self {
            storage,
            npcs,
            calc: Mutex::new(calc),
            bosses: Mutex::new((0, Vec::new())),
            arena: Mutex::new(ArenaWatch::default()),
            ports,
            ping,
            paused,
            party_only: AtomicBool::new(false),
            view: Mutex::new("damage".into()),
            watched: Mutex::new(Vec::new()),
            capturer, capture_error, game: Mutex::new((i64::MIN, false)) })
    }

    fn game_open(&self) -> bool {
        let now = crate::clock::now_ms();
        let mut g = self.game.lock();
        if now.saturating_sub(g.0) >= GAME_CHECK_MS || now < g.0 {
            *g = (now, platform::window_detector::find_aion2_window_title().is_some());
        }
        g.1
    }

    pub fn update(&self) -> Update {
        let party_only = self.party_only.load(Ordering::Relaxed);
        let view = self.view.lock().clone();
        let fight = {
            let mut calc = self.calc.lock();
            let dps = calc.get_dps();
            let mut fight = Fight::from_dps(&dps);
            fight.mark_party(self.storage.get_party_members().keys());
            if party_only {
                fight.keep_party();
            }
            let mut targets = dps.detail_target_ids.clone();
            if targets.is_empty() && dps.target_id != 0 {
                targets.push(dps.target_id);
            }
            targets.truncate(64);
            // Damage taken: what the fight's monsters did to each player, kept per fight.
            for &t in &targets {
                if let Some(td) = self.storage.get_target_snapshot_light(t) {
                    for (&actor, ad) in &td.actors {
                        if ad.damage_received > 0 {
                            fight.add_taken(actor, ad.damage_received, ad.hits_received);
                        }
                    }
                }
            }
            // Per-skill details for the rows opened in the UI: A2Tools' hover summary for damage;
            // healing per skill is only in the full details.
            let watched: Vec<i32> = self.watched.lock().iter().copied().filter(|id| fight.rows.iter().any(|r| r.id == *id)).collect();
            if !watched.is_empty() {
                if view == "healing" {
                    let entries: Vec<_> = targets.iter().flat_map(|&t| calc.get_target_details(t, Some(&watched)).heal_skills).collect();
                    fight.attach_heal_skills(&entries);
                } else {
                    let entries: Vec<_> = targets.iter().flat_map(|&t| calc.get_hover_details(t, Some(&watched)).skills).collect();
                    fight.attach_skills(&entries);
                }
            }
            fight
        };
        let port = self.ports.current_port();
        let (status, message) = match (&self.capture_error, port) {
            (Some(e), _) => ("no-capture", e.clone()),
            (None, Some(p)) => ("connected", format!("Connected to the game (port {p})")),
            (None, None) if self.game_open() => ("searching", "Looking for the game connection. Fight something or change zone.".into()),
            (None, None) => ("waiting-game", "Waiting for AION 2 to start".into()),
        };
        Update {
            status,
            message,
            port,
            device: self.ports.current_device(),
            ping_ms: port.and(self.ping.current_ping_ms()),
            paused: self.paused.load(Ordering::Relaxed),
            party_only,
            view,
            fight,
            bosses: self.boss_timers(),
            odyle: self.storage.odyle_energy().map(|(basic, charged)| Odyle { basic, charged, owner: self.storage.odyle_owner() }),
            profile: self.profile(),
            arena: self.arena_match(),
            position: {
                crate::position::set_me(self.storage.local_player_id().map(|id| id as i32));
                crate::position::latest()
            },
            cubes: crate::cubes::snapshot(),
        }
    }

    fn boss_timers(&self) -> Vec<BossTimer> {
        let mut b = self.bosses.lock();
        if let Some((seq, maps)) = self.storage.boss_maps_since(b.0) {
            let name = |id: u32| {
                FIELD_BOSSES.iter().find(|&&(_, w)| w == id).map(|&(code, _)| self.npcs.get_npc_name(code)).filter(|n| !n.is_empty())
            };
            let timers = maps.iter().flat_map(|m| {
                m.bosses.iter().map(move |x| (m, x))
            });
            *b = (seq, timers
                .map(|(m, x)| BossTimer {
                    map_id: m.map_id,
                    boss_id: x.id,
                    name: name(x.id).unwrap_or_else(|| format!("Boss {}", x.id)),
                    up: x.up,
                    time_ms: x.time_ms,
                    seen_ms: m.seen_ms,
                })
                .collect());
        }
        b.1.clone()
    }

    fn profile(&self) -> Option<Profile> {
        let p = self.storage.local_profile();
        Some(Profile {
            name: p.name.filter(|n| !n.trim().is_empty())?,
            server_id: p.server_id,
            job: p.class.map(|c| english_job(c.class_name())).unwrap_or_default(),
            level: p.level,
            gear_score: p.gear_score,
            combat_power: p.combat_power,
        })
    }

    /// Ends a match on the map load after it: PvP hits on an instance map (not the open world).
    fn arena_match(&self) -> Option<ArenaMatch> {
        let mut a = self.arena.lock();
        let zone = self.storage.zone_generations().0;
        if zone == a.zone {
            for id in self.storage.pvp_players() {
                if let Some(n) = self.storage.get_nickname(id) {
                    a.names.insert(id, n);
                }
            }
            return a.last.clone();
        }
        let hits = self.storage.take_pvp_ledger();
        let map = std::mem::replace(&mut a.map, self.storage.current_map_id());
        a.zone = zone;
        let names = std::mem::take(&mut a.names);
        if let Some(map_id) = map.filter(|&m| !is_open_world_map(m)) {
            let me = self.storage.local_player_id().map(|id| id as i32);
            let deaths = self.storage.deaths_between(i64::MIN, i64::MAX);
            if let Some(mut m) = build_match(map_id, &hits, me, &names, &self.storage.fight_roster(), &deaths) {
                let profile = self.storage.local_profile();
                for p in &mut m.players {
                    if p.server_id == 0 && !p.name.is_empty() {
                        p.server_id = self.storage.player_server(&p.name);
                    }
                    if p.side == "you" {
                        p.level = p.level.or(profile.level.map(|l| l as i32));
                        p.gear_score = p.gear_score.or(profile.gear_score);
                        p.combat_power = p.combat_power.or(profile.combat_power);
                    }
                }
                a.last = Some(m);
            }
        }
        a.last.clone()
    }

    /// A2Tools' `reset_combat`: clear the fight, keep the connection and the names the game sent.
    pub fn reset(&self) {
        self.calc.lock().restart_target_selection(true);
        self.storage.forget_guessed_nicknames();
        self.storage.hide_party_placeholders();
    }

    /// While paused, captured packets are dropped: nothing is counted and the timer stops.
    pub fn set_paused(&self, on: bool) {
        self.paused.store(on, Ordering::Relaxed);
    }

    /// Show only you and your party, or everyone who hit the target.
    pub fn set_party_only(&self, on: bool) {
        self.party_only.store(on, Ordering::Relaxed);
    }

    /// "damage" | "healing" | "taken"
    pub fn set_view(&self, view: &str) {
        if matches!(view, "damage" | "healing" | "taken") {
            *self.view.lock() = view.to_string();
        }
    }

    /// The rows whose per-skill breakdown the UI shows.
    pub fn watch_skills(&self, ids: Vec<i32>) {
        *self.watched.lock() = ids;
    }

    /// "bossTargets" | "mostDamage" | "mostRecent" | "lastHitByMe" | "allTargets" | "trainTargets"
    pub fn set_target_mode(&self, id: &str) {
        self.calc.lock().set_target_selection_mode(id);
    }

    /// Forget the locked connection and look for the game again (after a VPN change, say).
    pub fn reconnect(&self) {
        self.ports.reset();
        self.ping.reset();
    }

    pub fn capturing(&self) -> bool {
        self.capturer.as_ref().is_some_and(|c| c.is_running())
    }
}
