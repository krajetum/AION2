// DPS meter data as the Rust engine sends it ("meter-update", src-tauri/meter/src/{engine,snapshot}.rs),
// plus pure formatting helpers. No DOM, no Tauri.

export interface SkillRow { name: string; damage: number; hits: number; critRate: number; share: number; dot: boolean }
export interface PlayerRow {
  id: number;
  name: string; // empty until the game sends it (on loading screens)
  job: string; dps: number; damage: number;
  share: number; // 0..100 of the shown damage
  hps: number; heal: number; combatPower: number; gearScore: number;
  isYou: boolean;
  inParty: boolean; // you or a member of your party
  isOthers: boolean; // everyone outside your party on an open-world boss
  skills: SkillRow[];
}
export interface Target { name: string; isBoss: boolean; maxHp: number; currentHp: number; damageDealt: number }
export interface Fight { target: Target | null; targetMode: string; battleTimeMs: number; rows: PlayerRow[] }
export type MeterStatus = "no-capture" | "waiting-game" | "searching" | "connected";
export interface MeterUpdate {
  status: MeterStatus; message: string; port: number | null; device: string | null;
  pingMs: number | null; paused: boolean;
  partyOnly: boolean; // only you and your party, else everyone who hit the target
  fight: Fight;
  demo?: boolean; // browser preview only
}

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
