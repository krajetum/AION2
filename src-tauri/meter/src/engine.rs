//! Starts the vendored A2Tools pipeline (capture → dispatcher → storage → calculator)
//! the way A2Tools' `app.rs` does, without its windows, settings, uploads or plugins.
//! Written for the AION 2 Companion; GPL-3.0 like the rest of this crate.

use std::collections::HashSet;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use parking_lot::Mutex;
use serde::Serialize;

use crate::capture::combat_port_detector::CombatPortDetector;
use crate::capture::pcap_capturer::PcapCapturer;
use crate::combat::capture_dispatcher::CaptureDispatcher;
use crate::combat::data_storage::DataStorage;
use crate::combat::dps_calculator::DpsCalculator;
use crate::combat::ping_tracker::PingTracker;
use crate::i18n::lookup::{NpcLookup, SkillLookup};
use crate::platform;
use crate::snapshot::Fight;

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
    pub fight: Fight,
}

pub struct Engine {
    storage: Arc<DataStorage>,
    calc: Mutex<DpsCalculator>,
    ports: Arc<CombatPortDetector>,
    ping: Arc<PingTracker>,
    paused: Arc<AtomicBool>,
    party_only: AtomicBool,
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

        let mut dispatcher = CaptureDispatcher::new(storage.clone(), skills, npcs, ports.clone(), ping.clone());
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
            calc: Mutex::new(calc),
            ports,
            ping,
            paused,
            party_only: AtomicBool::new(false),
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
        let fight = {
            let mut calc = self.calc.lock();
            let dps = calc.get_dps();
            let mut fight = Fight::from_dps(&dps);
            fight.mark_party(self.storage.get_party_members().keys());
            if party_only {
                fight.keep_party();
            }
            // Per-skill details, A2Tools' hover summary, for the rows opened in the UI.
            let watched: Vec<i32> = self.watched.lock().iter().copied().filter(|id| fight.rows.iter().any(|r| r.id == *id)).collect();
            if !watched.is_empty() {
                let mut targets = dps.detail_target_ids.clone();
                if targets.is_empty() && dps.target_id != 0 {
                    targets.push(dps.target_id);
                }
                let entries: Vec<_> = targets.iter().take(64).flat_map(|&t| calc.get_hover_details(t, Some(&watched)).skills).collect();
                fight.attach_skills(&entries);
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
            fight,
        }
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
