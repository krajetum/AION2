// DPS meter data as the Rust engine sends it ("meter-update", src-tauri/meter/src/{engine,snapshot}.rs),
// plus pure formatting helpers. No DOM, no Tauri.

export interface SkillRow {
  name: string; damage: number; hits: number; critRate: number; share: number; dot: boolean;
  casts?: number; // times used (hits close together = one cast; the game sends no cast), absent in older saved fights
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
  // Boss fights only (the meter's totals over all skills); none in fights from before them.
  deaths?: number; // A2Tools' death marks: party members and named players
  deathTimes?: number[]; // when each death came, ms from the fight's first hit
  reviveTimes?: (number | null)[]; // when each of them was revived, same clock; null = not before the fight ended
  hits?: number; // hits dealt, DoT ticks included
  critRate?: number; // 0..1 of direct hits
  activeMs?: number; // time spent hitting the boss: each direct hit counts 2 s after it (the meter's ACTIVE_WINDOW_MS)
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
/** PvP on an instance map, logged on the map load after it. The app merges an arena's rounds (each a map load)
 *  into one match: `rounds` = their start times, `playMs` = their time without the pauses between (src/domain/arena.ts). */
export interface ArenaMatch { mapId: number; startMs: number; endMs: number; players: ArenaPlayer[]; rounds?: number[]; playMs?: number }
/** Where you are, from the last record that said (map loads, teleports, your own buffs): a few seconds old
 *  while you play, older when nothing is applied. Game units; mapId of the last map load, if seen. */
export interface SelfPosition { x: number; y: number; z: number; mapId: number | null; atMs: number }
/** A hidden cube in view (its code learned from a cube opened earlier). Game units. */
export interface Cube { entity: number; code: number; x: number; y: number; z: number; seenMs: number }
/** A cube opened since the meter started, by you or another player in view. */
export interface OpenedCube { code: number | null; x: number; y: number; z: number; byYou: boolean; atMs: number }
export interface Cubes { live: Cube[]; opened: OpenedCube[]; codes: number[] }
/** A PvP kill of yours, or your death, by the last hit before it (src-tauri/meter/src/kills.rs).
 *  other.dealt / other.taken: their damage to you / yours to them since the map load. */
export interface Kill { atMs: number; kind: "kill" | "assist" | "death"; mapId: number | null; other: ArenaPlayer }
/** A kill of yours that gave soul points (src-tauri/meter/src/souls.rs): where the mob died, its name when its spawn was seen. */
export interface SoulDrop { entity: number; x: number; y: number; z: number; mapId: number | null; kind: number; points: number; atMs: number; mobCode: number | null; mob: string }
/** An item a mob you killed dropped for you (src-tauri/meter/src/souls.rs `Loot`), where the mob died. */
export interface LootDrop { entity: number; item: number; x: number; y: number; z: number; mapId: number | null; atMs: number; mobCode: number | null; mob: string }
import type { PetCollection } from "./pets.ts";
import type { MeterWallet } from "./wallet.ts";
export interface MeterUpdate {
  status: MeterStatus; message: string; port: number | null; device: string | null;
  pingMs: number | null; paused: boolean;
  lossPct?: number | null; // segments resent on the game connection over the last minute, %: the loss at most (netstats.rs)
  partyOnly: boolean; // only you and your party, else everyone who hit the target
  view: MeterView; // what the rows are ranked by (the overlay follows it)
  fight: Fight;
  bosses: BossTimer[]; // every map opened since the meter started
  odyle: Odyle | null;
  profile: Profile | null;
  arena: ArenaMatch | null; // the last match that ended
  position?: SelfPosition | null;
  travel?: { mounted: boolean; gliding: boolean }; // the meter's position.rs: your position does not come then
  cubes?: Cubes;
  kills?: Kill[];
  pvpDeaths?: number[]; // deaths of players (not you or your party) in PvP hits, last 10 min: your party's kills give you AP too
  souls?: SoulDrop[];
  soulGains?: { kind: number; points: number; atMs: number }[]; // every soul point gain: the collection counts these
  loots?: LootDrop[];
  pets?: PetCollection | null; // from the last time you entered the world (login, character select)
  wallet?: MeterWallet | null; // your currencies, on their character (src/domain/wallet.ts)
  lostPackets?: number; // thrown away since the start: the parser fell behind (crowded fights)
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

export interface Stat { label: string; value: string; sub: string }

/** Share of the fight (`ms` long) the player spent hitting the boss, 0..1; none for fights from before active time. */
export const activeShare = (r: PlayerRow, ms: number): number | undefined =>
  r.activeMs == null || ms <= 0 ? undefined : Math.min(1, r.activeMs / ms);
/** "82%", or "—" when not known (not a boss, an older fight). */
export const activeText = (r: PlayerRow, ms: number) => { const a = activeShare(r, ms); return a == null ? "—" : `${Math.round(a * 100)}%`; };
/** "12% HP left", "killed", or "" when the boss's HP isn't known. */
export const hpText = (left: number | undefined) => (left == null ? "" : left <= 0 ? "killed" : `${Math.max(1, Math.round(left * 100))}% HP left`);

/** A player's advanced stats in a fight (`ms` = its length): damage, hits and crits, healing, deaths with their times, damage taken.
 *  Hits and crit rate fall back to the skills kept when the meter sent no totals (fights from before them, rows open on the DPS page). */
export function advancedStats(r: PlayerRow, ms: number): Stat[] {
  const direct = r.skills.filter((s) => !s.dot);
  const hits = r.hits ?? (r.skills.length ? r.skills.reduce((a, s) => a + s.hits, 0) : undefined);
  const directHits = direct.reduce((a, s) => a + s.hits, 0);
  const crit = r.critRate ?? (directHits ? direct.reduce((a, s) => a + s.critRate * s.hits, 0) / directHits : undefined);
  const sec = Math.max(1, ms / 1000);
  const times = r.deathTimes ?? [];
  // How long each death lasted: to the revive, else to the fight's end; none for fights from before revive times.
  const dead = (t: number, i: number) => {
    if (!r.reviveTimes || i >= r.reviveTimes.length) return clock(t);
    const back = r.reviveTimes[i];
    const s = Math.max(0, Math.round(((back ?? ms) - t) / 1000));
    return back == null ? `${clock(t)} (dead ${s} s, not revived)` : `${clock(t)} (dead ${s} s)`;
  };
  return [
    { label: "Damage", value: short(r.damage), sub: `${short(r.dps)}/s` },
    { label: "Active time", value: activeText(r, ms), sub: r.activeMs == null ? "" : `${clock(Math.min(r.activeMs, ms))} of ${clock(ms)} hitting the boss` },
    { label: "Hits", value: hits == null ? "—" : short(hits), sub: hits ? `${(hits / sec).toFixed(1)}/s` + (crit == null ? "" : ` · crit ${Math.round(crit * 100)}%`) : "" },
    { label: "Healing", value: r.heal ? short(r.heal) : "—", sub: r.heal ? `${short(r.hps)}/s` : "" },
    { label: "Deaths", value: r.deaths == null ? "—" : String(r.deaths), sub: times.length ? `at ${times.map(dead).join(", ")}` : "" },
    { label: "Damage taken", value: r.damageTaken ? short(r.damageTaken) : "—", sub: r.hitsTaken ? `${r.hitsTaken} hits` : "" },
  ];
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
  connections?: number; // other game connections seen
  ended: string | null; // why it stopped by itself (time or size limit, write error)
}

/** 512 → "512 B", 1_500_000 → "1.4 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
