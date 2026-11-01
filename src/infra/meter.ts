// DPS meter bridge to the Rust engine (src-tauri/src/meter.rs): start, controls, "meter-update" and
// "meter-overlay" events. Outside Tauri (npm run dev in a browser) there is no capture, so a clearly
// labelled demo fight stands in, only to preview the UI.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ArenaMatch, BossTimer, MeterUpdate, MeterView, PlayerRow, RecorderStatus } from "../domain/meter.ts";

let started = false;
let last: MeterUpdate | undefined;
const subs = new Set<(u: MeterUpdate) => void>();
const emit = (u: MeterUpdate) => { last = u; subs.forEach((f) => f(u)); };

/**
 * Starts the engine once (main.ts calls it at app start) and calls `fn` with every update.
 * Returns the unsubscribe function.
 */
export function onMeter(fn: (u: MeterUpdate) => void): () => void {
  subs.add(fn);
  if (last) fn(last);
  if (!started) {
    started = true;
    if (isTauri()) {
      listen<MeterUpdate>("meter-update", (e) => emit(e.payload))
        .then(() => invoke<MeterUpdate>("meter_start"))
        .then(emit)
        .catch((e) => console.error("DPS meter failed to start", e));
    } else startDemo();
  }
  return () => { subs.delete(fn); };
}

const call = (cmd: string, args?: Record<string, unknown>) => (isTauri() ? invoke<void>(cmd, args) : demoCall(cmd, args));
export const meterReset = () => call("meter_reset");
export const meterPause = (paused: boolean) => call("meter_pause", { paused });
export const meterTargetMode = (mode: string) => call("meter_target_mode", { mode });
export const meterReconnect = () => call("meter_reconnect");
/** Only you and your party, or everyone who hit the target. */
export const meterPartyOnly = (on: boolean) => call("meter_party_only", { on });
/** What the rows are ranked by: damage, healing or damage taken. */
export const meterView = (view: string) => call("meter_view", { view });
/** The rows whose skill breakdown is open: only they get per-skill details. */
export const meterWatch = (ids: number[]) => call("meter_watch", { ids });
/** Turns the overlay on (it shows during fights, now too with showNow, and hides when idle) or off (desktop only). */
export const meterOverlay = (show: boolean, showNow = true) => (isTauri() ? invoke<void>("meter_overlay", { show, showNow }) : Promise.resolve());
/** Hides the overlay until the fight moves again. */
export const meterOverlayHide = () => (isTauri() ? invoke<void>("meter_overlay_hide") : Promise.resolve());
/** Seconds without damage, healing or damage taken before the fight resets and the overlay hides (0 = never). */
export const meterIdle = (secs: number) => (isTauri() ? invoke<void>("meter_idle", { secs }) : Promise.resolve());
/** The event countdown overlay on or off (desktop only). */
export const netOverlay = (show: boolean) => (isTauri() ? invoke<void>("net_overlay", { show }) : Promise.resolve());
export const eventsOverlay = (show: boolean) => (isTauri() ? invoke<void>("events_overlay", { show }) : Promise.resolve());
/** Overlays: hide while another window than the game is in front, and background opacity (20..100 %). */
export const overlayStyle = (followGame: boolean, opacity: number) =>
  (isTauri() ? invoke<void>("overlay_style", { followGame, opacity }) : Promise.resolve());
/** The overlays' opacity now and on every change (for an overlay window). */
export async function onOpacity(fn: (opacity: number) => void) {
  if (!isTauri()) return fn(90);
  fn(await invoke<number>("overlay_opacity"));
  await listen<number>("overlay-opacity", (e) => fn(e.payload));
}
/** Sets this overlay window's height to its content (desktop only), up to 85 % of the screen; the width
 *  stays as the player left it. Above that the window scrolls. */
let lastHeight = 0;
export async function fitOverlayHeight(px: number) {
  if (!isTauri()) return;
  const h = Math.ceil(Math.min(px, screen.availHeight * 0.85));
  if (Math.abs(h - lastHeight) < 2) return;
  lastHeight = h;
  const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setSize(new LogicalSize(window.innerWidth, h)).catch((e) => console.warn("Overlay resize failed", e));
}
/** The radar on or off (desktop only): cubes around you, north up, to lay over the game's minimap. */
export const radarOverlay = (show: boolean) => (isTauri() ? invoke<void>("radar_overlay", { show }) : Promise.resolve());
/** Sets this overlay window's size (desktop only): the cube popup grows for its "cube opened" picture. */
export async function sizeOverlay(w: number, h: number) {
  if (!isTauri()) return;
  const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setSize(new LogicalSize(Math.round(w), Math.round(h))).catch((e) => console.warn("Overlay resize failed", e));
}
/** The "hidden cube nearby" popup on or off (desktop only): it shows while a known cube is in view. */
export const cubePopup = (show: boolean, scale = 1) => (isTauri() ? invoke<void>("cube_popup", { show, scale }) : Promise.resolve());
/** Hands the engine the cube codes learned in earlier sessions. */
export const meterCubeCodes = (codes: number[]) => (isTauri() ? invoke<void>("meter_cube_codes", { codes }) : Promise.resolve());
/** The event overlay was turned on or off (also from the overlay itself). */
export const onNetOverlay = (fn: (on: boolean) => void) => (isTauri() ? listen<boolean>("net-overlay", (e) => fn(e.payload)) : Promise.resolve(() => {}));
export const onEventsOverlay = (fn: (on: boolean) => void) => (isTauri() ? listen<boolean>("events-overlay", (e) => fn(e.payload)) : Promise.resolve(() => {}));
/** The overlay was opened or closed (also from the overlay itself). */
export const onOverlay = (fn: (open: boolean) => void) => (isTauri() ? listen<boolean>("meter-overlay", (e) => fn(e.payload)) : Promise.resolve(() => {}));

/** The crash log (desktop only): where it is and its last part, empty when nothing crashed. */
export const crashLog = () => (isTauri() ? invoke<{ path: string | null; text: string }>("crash_log") : Promise.resolve(null));
/** Packet recorder (desktop only; null in the browser): every frame the meter reads, to a file in Downloads. */
const rec = (cmd: string, args?: Record<string, unknown>) => (isTauri() ? invoke<RecorderStatus>(cmd, args) : Promise.resolve(null));
export const recorderStart = () => rec("recorder_start");
export const recorderMark = (label: string) => rec("recorder_mark", { label });
export const recorderStop = () => rec("recorder_stop");
export const recorderStatus = () => rec("recorder_status");

// ---------- demo (browser preview only) ----------
let demo = { start: Date.now(), paused: false, partyOnly: false, view: "damage" as MeterView, mode: "bossTargets", dmg: [0, 0, 0, 0, 0] };
const DEMO_PARTY = [
  { name: "You", job: "Gladiator", rate: 21_000 },
  { name: "Partymate A", job: "Sorcerer", rate: 26_000 },
  { name: "Partymate B", job: "Ranger", rate: 17_000 },
  { name: "Partymate C", job: "Cleric", rate: 6_000 },
  { name: "", job: "Ranger", rate: 9_000 }, // a stranger whose name the game has not sent yet
];
const DEMO_SPLIT = [0.42, 0.28, 0.2, 0.1];
const DEMO_SEEN = Date.now();
const DEMO_BOSSES: BossTimer[] = [
  { mapId: 1, bossId: 101006, name: "Demo boss: Bodyguard Teegant", up: false, timeMs: DEMO_SEEN + 7 * 60_000, seenMs: DEMO_SEEN },
  { mapId: 1, bossId: 101001, name: "Demo boss: Neikel of the East", up: false, timeMs: DEMO_SEEN + 52 * 60_000, seenMs: DEMO_SEEN },
  { mapId: 1, bossId: 101003, name: "Demo boss: Kernon of the West", up: true, timeMs: DEMO_SEEN - 20 * 60_000, seenMs: DEMO_SEEN },
  { mapId: 2, bossId: 2003, name: "Boss 2003", up: false, timeMs: DEMO_SEEN + 7 * 60_000, seenMs: DEMO_SEEN }, // a boss the game data doesn't name
];
const demoPlayer = (id: number, name: string, side: "you" | "ally" | "opponent", job: string, dealt: number, taken: number, deaths: number, gs: number | null) =>
  ({ id, name, side, job, serverId: 1304, dealt, taken, hits: Math.round(dealt / 4000), deaths, level: gs && 45, gearScore: gs, combatPower: gs && gs * 25 });
const DEMO_MATCH: ArenaMatch = {
  mapId: 600501, startMs: DEMO_SEEN - 15 * 60_000, endMs: DEMO_SEEN - 11 * 60_000, players: [
    demoPlayer(1, "Main", "you", "Gladiator", 410_000, 260_000, 1, 2040),
    demoPlayer(2, "Partymate A", "ally", "Cleric", 120_000, 180_000, 0, 1980),
    demoPlayer(3, "Demo Foe", "opponent", "Sorcerer", 300_000, 300_000, 1, null),
    demoPlayer(4, "Demo Foe 2", "opponent", "Templar", 140_000, 230_000, 2, null),
  ],
};

function demoUpdate(): MeterUpdate {
  const t = Date.now() - demo.start;
  if (!demo.paused) demo.dmg = DEMO_PARTY.map((p, i) => Math.round(p.rate * t / 1000 * (0.9 + 0.2 * Math.abs(Math.sin(t / 3000 + i)))));
  const shown = DEMO_PARTY.map((p, i) => ({ p, i })).filter(({ i }) => !demo.partyOnly || i < 4);
  const total = shown.reduce((a, { i }) => a + demo.dmg[i], 0) || 1;
  const rows: PlayerRow[] = shown.map(({ p, i }) => ({
    id: i === 4 ? 16546 : i + 1, name: p.name, job: p.job, damage: demo.dmg[i], dps: demo.dmg[i] / Math.max(1, t / 1000),
    share: demo.dmg[i] / total * 100, hps: i === 3 ? 5_200 : 0, heal: i === 3 ? 5.2 * t : 0, combatPower: 0, gearScore: 0,
    isYou: i === 0, inParty: i < 4, isOthers: false, damageTaken: Math.round([3, 0.5, 0.8, 0.6, 1][i] * t), hitsTaken: Math.round(t / 2000),
    healSkills: i === 3 ? [{ name: "Demo heal", damage: Math.round(3.6 * t), hits: Math.round(t / 1500), critRate: 0, share: 0.7, dot: false, icon: null },
      { name: "Demo regen", damage: Math.round(1.6 * t), hits: Math.round(t / 1000), critRate: 0, share: 0.3, dot: true, icon: null }] : [],
    skills: DEMO_SPLIT.map((share, k) => ({
      name: `Demo skill ${k + 1}`, damage: Math.round(demo.dmg[i] * share), hits: Math.round(t / 900 / (k + 1)),
      critRate: 0.3 - k * 0.05, share, dot: k === 3, icon: null,
    })),
  })).sort((a, b) => b.damage - a.damage);
  return {
    status: "connected", message: "Demo fight (browser preview, not real data)", port: null, device: null, pingMs: 42,
    paused: demo.paused, partyOnly: demo.partyOnly, view: demo.view, demo: true,
    bosses: DEMO_BOSSES, odyle: { basic: 30, charged: 840, owner: "Main" },
    // The amounts after the shop of 2026-10-27 12:47.
    wallet: { owner: "Main", values: { "930100031": 5_061_092, "930100001": 0, "930100003": 225_824, "930100017": 35_085, "930100011": 235 }, atMs: DEMO_SEEN - 5 * 60_000,
      apGains: [{ amount: 1_200, mapId: 20, atMs: DEMO_SEEN - 50 * 60_000 }, { amount: 35, mapId: 20, atMs: DEMO_SEEN - 40 * 60_000 }, { amount: 800, mapId: 1110, atMs: DEMO_SEEN - 30 * 60_000 }] },
    profile: { name: "Demo Alt", serverId: 1304, job: "Gladiator", level: 45, gearScore: 2040, combatPower: 51_000 }, arena: DEMO_MATCH,
    // Near Safe Haven, walking slowly; as if read 2 s ago.
    kills: [
      { atMs: DEMO_SEEN - 40 * 60_000, kind: "kill", mapId: 1110, other: { ...DEMO_MATCH.players[2], dealt: 41_000, taken: 96_000 } },
      { atMs: DEMO_SEEN - 32 * 60_000, kind: "assist", mapId: null, other: { ...DEMO_MATCH.players[3], dealt: 8_000, taken: 22_000 } },
      { atMs: DEMO_SEEN - 25 * 60_000, kind: "death", mapId: 600501, other: { ...DEMO_MATCH.players[3], dealt: 120_000, taken: 30_000 } },
    ],
    position: { x: -82550 + 40 * Math.sin(t / 20_000) * 100, y: -130802 - (t / 1000) * 30, z: 34431, mapId: 1110, atMs: Date.now() - 2000 },
    // A demo cube 40 m north-east of the demo position: in view for 15 s, then opened (by you, then by
    // someone else, in turns), every 20 s.
    cubes: demoCubes(t),
    // Part of the collection read on 2026-10-26 12:05 (Unstable Spider 1117, Armadon 1046), and two kills since.
    pets: { atMs: DEMO_SEEN - 10 * 60_000, pets: [
      { id: 1117, level: 2, points: 55 }, { id: 1046, level: 2, points: 39 }, { id: 1005, level: 3, points: 0 },
      { id: 1097, level: 1, points: 21 }, { id: 1016, level: 2, points: 12 }, { id: 1039, level: 1, points: 19 },
    ] },
    souls: [
      { entity: 40080, x: -81500, y: -131000, z: 34400, mapId: 1110, kind: 1097, points: 1, atMs: DEMO_SEEN - 4 * 60_000, mobCode: 2100752, mob: "Highland Karnif" },
      { entity: 40081, x: -84000, y: -132500, z: 34400, mapId: 1110, kind: 1005, points: 1, atMs: DEMO_SEEN - 2 * 60_000, mobCode: 2100700, mob: "Demo Maxed Mob" },
    ],
    // Loots of the friend's recording of 2026-10-25 19:16 (610531002 = Agrint), near the demo position.
    loots: [
      { entity: 18041, item: 610531002, x: -82000, y: -131500, z: 34400, mapId: 1110, atMs: DEMO_SEEN - 5 * 60_000, mobCode: 2400214, mob: "Mutated Forest Guardian" },
      { entity: 18041, item: 534660178, x: -82000, y: -131500, z: 34400, mapId: 1110, atMs: DEMO_SEEN - 5 * 60_000, mobCode: 2400214, mob: "Mutated Forest Guardian" },
      { entity: 32522, item: 534660199, x: -83500, y: -129000, z: 34400, mapId: 1110, atMs: DEMO_SEEN - 3 * 60_000, mobCode: 2400221, mob: "Mutated Elim" },
    ],
    fight: { target: { name: "Demo Boss", isBoss: true, maxHp: 40_000_000, currentHp: -1, damageDealt: total }, targetMode: demo.mode, battleTimeMs: t, rows },
  };
}

function demoCubes(t: number) {
  const round = Math.floor(t / 20_000), entity = round + 1;
  const at = { x: -79700, y: -133600 - (t / 1000) * 30, z: 33600 }; // ~8 m below the demo position
  return t % 20_000 < 15_000
    ? { live: [{ entity, code: 1301199, ...at, seenMs: demo.start + round * 20_000 }], opened: [], codes: [1301199] }
    : { live: [], opened: [{ code: 1301199, ...at, byYou: round % 2 === 0, atMs: demo.start + round * 20_000 + 15_000 }], codes: [1301199] };
}

function startDemo() {
  emit(demoUpdate());
  setInterval(() => emit(demoUpdate()), 500);
}

async function demoCall(cmd: string, args?: Record<string, unknown>) {
  if (cmd === "meter_reset") demo = { ...demo, start: Date.now(), dmg: [0, 0, 0, 0, 0] };
  if (cmd === "meter_party_only") demo.partyOnly = !!args?.on;
  if (cmd === "meter_view") demo.view = args?.view as MeterView;
  if (cmd === "meter_pause") demo.paused = !!args?.paused;
  if (cmd === "meter_target_mode") demo.mode = String(args?.mode);
  emit(demoUpdate());
}
