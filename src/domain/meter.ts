// DPS meter data as the Rust engine sends it ("meter-update", src-tauri/meter/src/{engine,snapshot}.rs),
// plus pure formatting helpers. No DOM, no Tauri.

export interface SkillRow {
  name: string; damage: number; hits: number; critRate: number; share: number; dot: boolean;
  icon: string | null; // icon file on NCSOFT's game-data CDN (skillIconUrl), none for basic attacks
}

/** Where the official skill icons are: NCSOFT's game-data CDN, as A2Tools loads them (plain <img>, no CORS needed). */
export const skillIconUrl = (icon: string) => `https://assets.playnccdn.com/static-aion2-gamedata/resources/${icon}.png`;

/** A color per class (English names, as the engine sends them): each class emblem's own color
 *  (src/ui/classes/*.png), a little lighter so bars stay readable on the dark theme. */
export const CLASS_COLORS: Record<string, string> = {
  Gladiator: "#5fb3c8", Templar: "#6a8ee6", Assassin: "#5aae46", Ranger: "#3fa57a", Sorcerer: "#9a6ae0",
  Spiritmaster: "#c055c2", Cleric: "#d8b45a", Chanter: "#e09a48", Brawler: "#d24360",
};
export const classColor = (job: string) => CLASS_COLORS[job] ?? "";
export interface PlayerRow {
  id: number;
  name: string; // empty until the game sends it (on loading screens)
  job: string; dps: number; damage: number;
  share: number; // 0..100 of the shown damage
  hps: number; heal: number; combatPower: number; gearScore: number;
  isYou: boolean;
  inParty: boolean; // you or a member of your party
  isOthers: boolean; // everyone outside your party on an open-world boss
  damageTaken: number; hitsTaken: number; // from the fight's monsters
  skills: SkillRow[];
  healSkills: SkillRow[]; // damage = amount healed, hits = ticks
}
export interface Target { name: string; isBoss: boolean; maxHp: number; currentHp: number; damageDealt: number }
export interface Fight { target: Target | null; targetMode: string; battleTimeMs: number; rows: PlayerRow[] }
export type MeterStatus = "no-capture" | "waiting-game" | "searching" | "connected";
/** A field boss from a map the player opened in game. timeMs (unix ms): up since, or respawns at; 0 = not given. */
export interface BossTimer { mapId: number; bossId: number; name: string; up: boolean; timeMs: number; seenMs: number }
export interface Odyle { basic: number; charged: number; owner: string | null }
/** Who you are playing, as the game said. */
export interface Profile { name: string; serverId: number; job: string; level: number | null; gearScore: number | null; combatPower: number | null }
export type ArenaSide = "you" | "ally" | "opponent";
/** Gear (level, gearScore, combatPower) is known for you and your party only. */
export interface ArenaPlayer {
  id: number; name: string; side: ArenaSide; job: string; serverId: number;
  dealt: number; taken: number; hits: number; deaths: number;
  level: number | null; gearScore: number | null; combatPower: number | null;
}
/** PvP on an instance map, logged on the map load after it. */
export interface ArenaMatch { mapId: number; startMs: number; endMs: number; players: ArenaPlayer[] }
export interface MeterUpdate {
  status: MeterStatus; message: string; port: number | null; device: string | null;
  pingMs: number | null; paused: boolean;
  partyOnly: boolean; // only you and your party, else everyone who hit the target
  view: MeterView; // what the rows are ranked by (the overlay follows it)
  fight: Fight;
  bosses: BossTimer[]; // every map opened since the meter started
  odyle: Odyle | null;
  profile: Profile | null;
  arena: ArenaMatch | null; // the last match that ended
  demo?: boolean; // browser preview only
}

/** The Odyle energy the game sent, if it is this character's. */
export const odyleFor = (u: MeterUpdate | undefined, charName: string | undefined) =>
  u?.odyle?.owner && charName && sameName(u.odyle.owner, charName) ? u.odyle : undefined;

export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A2Tools' target modes (DpsCalculator::TargetSelectionMode ids) and their labels. */
export const TARGET_MODES: [string, string][] = [
  ["bossTargets", "Bosses"],
  ["lastHitByMe", "Last hit by me"],
  ["mostDamage", "Most damage"],
  ["mostRecent", "Most recent"],
  ["allTargets", "All targets"],
  ["trainTargets", "Trains (pulls)"],
];

export const STATUS_TEXT: Record<MeterStatus, string> = {
  "no-capture": "Capture unavailable",
  "waiting-game": "Waiting for the game",
  searching: "Searching",
  connected: "Connected",
};

export type MeterView = "damage" | "healing" | "taken";
export const VIEWS: [MeterView, string][] = [["damage", "Damage"], ["healing", "Healing"], ["taken", "Damage taken"]];

/** A row as one view shows it: the number it is ranked by, per second, and its share of the shown total (0..100). */
export interface ViewRow { row: PlayerRow; value: number; perSec: number; share: number }

/** Rows for a view, biggest first: only players with something to show in it. */
export function viewRows(f: Fight, view: MeterView): ViewRow[] {
  const valueOf = (r: PlayerRow) => (view === "healing" ? r.heal : view === "taken" ? r.damageTaken : r.damage);
  const rows = f.rows.filter((r) => valueOf(r) > 0);
  const total = rows.reduce((a, r) => a + valueOf(r), 0);
  const secs = Math.max(1, f.battleTimeMs / 1000);
  return rows
    .map((row) => ({
      row,
      value: valueOf(row),
      perSec: view === "damage" ? row.dps : view === "healing" ? row.hps : valueOf(row) / secs,
      share: view === "damage" ? row.share : total > 0 ? valueOf(row) / total * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value || a.row.id - b.row.id);
}

/** A row's name: the character name, "You", or the entity id until the game sends the name. */
export const displayName = (r: PlayerRow) => r.name || (r.isYou ? "You" : `#${r.id}`);

/** 950 → "950", 12_345 → "12.3K", 4_560_000 → "4.56M". */
export function short(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toLocaleString("en-US");
}

/** Fight clock "m:ss". */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Remaining HP 0..1: the live HP when the game sent it, else max − damage dealt; undefined without a max. */
export function hpLeft(t: Target): number | undefined {
  if (t.maxHp <= 0) return undefined;
  const cur = t.currentHp >= 0 ? t.currentHp : t.maxHp - t.damageDealt;
  return Math.max(0, Math.min(1, cur / t.maxHp));
}

/** The packet recorder (Settings > Diagnostics), as src-tauri/meter/src/recorder.rs reports it. */
export interface RecorderStatus {
  recording: boolean;
  path: string | null; // the file of the current or last recording
  ms: number; frames: number; bytes: number; marks: number;
  ended: string | null; // why it stopped by itself (time or size limit, write error)
}

/** 512 → "512 B", 1_500_000 → "1.4 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
