// Field-boss respawn timers from the maps the player opened in game (the meter's "bosses"). Pure.
import { dueLeads } from "./alerts.ts";
import type { BossTimer } from "./meter.ts";
import type { BossAlert } from "./types.ts";

/** The saved timers with the maps read since: a map read again replaces its bosses.
 *  undefined when nothing is newer (the meter resends every map with each update). */
export function mergeBosses(saved: BossTimer[], fresh: BossTimer[]): BossTimer[] | undefined {
  const seen = new Map(saved.map((b) => [b.mapId, b.seenMs]));
  const newer = new Set(fresh.filter((b) => b.seenMs > (seen.get(b.mapId) ?? -1)).map((b) => b.mapId));
  if (!newer.size) return undefined;
  return [...saved.filter((b) => !newer.has(b.mapId)), ...fresh.filter((b) => newer.has(b.mapId))];
}

/** up: up since timeMs (when the map was read) · due: respawns at timeMs · passed: its respawn time
 *  went by after the map was read (probably up) · unknown: the game gave no time. */
export type BossState = "up" | "due" | "passed" | "unknown";

export function bossState(b: BossTimer, now: number): BossState {
  if (b.up) return "up";
  if (!b.timeMs) return "unknown";
  return b.timeMs > now ? "due" : "passed";
}

/** The bosses worth a timer: next respawns first, then the ones up. */
export function bossBoard(bosses: BossTimer[], now: number, max = 6): BossTimer[] {
  const due = bosses.filter((b) => bossState(b, now) === "due").sort((a, b) => a.timeMs - b.timeMs);
  const up = bosses.filter((b) => b.up).sort((a, b) => b.seenMs - a.seenMs);
  return [...due, ...up].slice(0, max);
}

const ORDER: Record<BossState, number> = { up: 0, due: 1, passed: 2, unknown: 3 };

/** Every boss by map (map read most recently first): up, then next respawns, then the rest. */
export function bossesByMap(bosses: BossTimer[], now: number): { mapId: number; seenMs: number; bosses: BossTimer[] }[] {
  const maps = new Map<number, BossTimer[]>();
  for (const b of bosses) maps.set(b.mapId, [...(maps.get(b.mapId) ?? []), b]);
  return [...maps].map(([mapId, list]) => ({
    mapId,
    seenMs: Math.max(...list.map((b) => b.seenMs)),
    bosses: list.sort((a, b) => ORDER[bossState(a, now)] - ORDER[bossState(b, now)]
      || (bossState(a, now) === "up" ? b.timeMs - a.timeMs : a.timeMs - b.timeMs) || a.name.localeCompare(b.name)),
  })).sort((a, b) => b.seenMs - a.seenMs);
}

/** Key for a boss's alerts in AppData.warnedEvent. */
export const bossKey = (b: BossTimer) => `boss:${b.mapId}:${b.bossId}`;

/** An armed boss whose respawn is now `lead` minutes (or less) away. last = the alert's shortest lead:
 *  a one-time alert is done after it. */
export interface DueBossAlert { boss: BossTimer; alert: BossAlert; leads: number[]; last: boolean; minutes: number }

/** The armed bosses with leads due and not yet warned (warned[`${bossKey}@${lead}`] === the respawn time).
 *  Only respawns still ahead: a time that passed while the app was closed is not announced late. */
export function dueBossAlerts(bosses: BossTimer[], alerts: Record<string, BossAlert>, warned: Record<string, number>, now: number): DueBossAlert[] {
  const out: DueBossAlert[] = [];
  for (const boss of bosses) {
    const alert = alerts[boss.bossId];
    if (!alert || bossState(boss, now) !== "due") continue;
    const key = bossKey(boss);
    const leads = dueLeads(alert.leads, boss.timeMs - now, (l) => warned[`${key}@${l}`] === boss.timeMs);
    if (!leads.length) continue;
    out.push({ boss, alert, leads, last: leads.includes(Math.min(...alert.leads)), minutes: Math.max(1, Math.round((boss.timeMs - now) / 60_000)) });
  }
  return out;
}
/** The meter has no name for some bosses (the Abyss's 2002-2005: not in A2Tools' tables) and sends
 *  "Boss <id>" or nothing; older saves keep that text. */
export const isUnnamed = (name: string) => !name.trim() || /^Boss \d+$/.test(name.trim());

/** Abyss boss names in A2Tools' NPC table (codes 2600xxx flagged as bosses), as suggestions when the
 *  player names an unnamed boss. Which world-map id is which boss is not in any data we have. */
export const ABYSS_BOSS_NAMES = [
  "Watcher Kaira", "Guardian Lord Nahma", "Enraged Guardian Lord Nahma", "Executor Tamasa", "Executor Argo", "Executor Kaira",
  "Daeva Reaper Akasha", "Heretic Remus", "Takshaka Air Raiders Captain", "Takshaka Strike Force Captain",
  "Division Commander Durdhara", "High Commander Nirmala", "Guardian Lord Prasada", "Executioner Dramos", "Turncoat Ducal",
  "Ravager Marakha",
];

/** A boss's name: the player's own for it, the game's, or "Unknown boss #id". */
export const bossLabel = (b: BossTimer, names: Record<string, string> = {}) =>
  names[b.bossId] || (isUnnamed(b.name) ? `Unknown boss #${b.bossId}` : b.name);

/** The next field-boss respawn (events overlay): every boss due in that same minute, by name.
 *  Empty when no respawn time is ahead. */
export function nextBossWave(bosses: BossTimer[], now: number, names: Record<string, string> = {}): { timeMs: number; names: string[] } {
  const due = bosses.filter((b) => bossState(b, now) === "due");
  if (!due.length) return { timeMs: 0, names: [] };
  const minute = (t: number) => Math.floor(t / 60_000);
  const first = Math.min(...due.map((b) => b.timeMs));
  const wave = due.filter((b) => minute(b.timeMs) === minute(first));
  return { timeMs: first, names: [...new Set(wave.map((b) => bossLabel(b, names)))].sort((a, b) => a.localeCompare(b, "en", { numeric: true })) };
}
