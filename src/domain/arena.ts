// Arena matchup log: matches as the meter sends them ("arena"), map names the user gives. Pure.
import type { ArenaMatch, Kill } from "./meter.ts";

export interface ArenaLog {
  matches: ArenaMatch[]; // newest first, max MAX_MATCHES
  maps: Record<string, string>; // map id → name the user gave it
  kills: Kill[]; // your PvP kills and deaths, newest first, max MAX_KILLS
}

export const MAX_MATCHES = 100;
export const MAX_KILLS = 500;
/** The meter resends its last kills; one death logged twice comes this close together. */
const SAME_KILL_MS = 3_000;

/** Adds the kills not logged yet (newest first). Returns how many were new. */
export function logKills(log: ArenaLog, kills: Kill[]): number {
  let added = 0;
  for (const k of kills) {
    if (log.kills.some((x) => x.kind === k.kind && x.other.id === k.other.id && Math.abs(x.atMs - k.atMs) < SAME_KILL_MS)) continue;
    log.kills.push(k);
    added++;
  }
  if (added) {
    log.kills.sort((a, b) => b.atMs - a.atMs);
    log.kills.length = Math.min(log.kills.length, MAX_KILLS);
  }
  return added;
}

export const sameMatch = (a: ArenaMatch, b: ArenaMatch) =>
  a.mapId === b.mapId && (a.startMs === b.startMs || !!a.rounds?.includes(b.startMs));

/** An arena's next round starts this soon after the last one's last hit (the 1v1 of 2026-10-27: 18 s). */
export const ROUND_GAP_MS = 120_000;
const opponents = (m: ArenaMatch) => new Set(m.players.filter((p) => p.side === "opponent" && p.name).map((p) => p.name));

/**
 * The meter ends a match at every map load, and an arena reloads its map between rounds (a 1v1 ends after
 * 3 deaths or 10 minutes): a round on the same map, starting within ROUND_GAP_MS of the last match's end,
 * against an opponent of it, is that match's next round. Its players are added by name (ids change with
 * each load). Returns true if `m` was merged into `prev`.
 */
export function mergeRound(prev: ArenaMatch, m: ArenaMatch): boolean {
  const theirs = opponents(prev);
  if (prev.mapId !== m.mapId || m.startMs < prev.endMs || m.startMs - prev.endMs > ROUND_GAP_MS
    || ![...opponents(m)].some((n) => theirs.has(n))) return false;
  prev.playMs = (prev.playMs ?? prev.endMs - prev.startMs) + (m.endMs - m.startMs);
  prev.rounds = [...(prev.rounds ?? [prev.startMs]), m.startMs];
  prev.endMs = m.endMs;
  for (const p of m.players) {
    const q = prev.players.find((q) => q.name && q.name === p.name);
    if (!q) { prev.players.push({ ...p }); continue; }
    q.dealt += p.dealt; q.taken += p.taken; q.hits += p.hits; q.deaths += p.deaths;
    q.serverId ||= p.serverId; q.job ||= p.job;
    q.level ??= p.level; q.gearScore ??= p.gearScore; q.combatPower ??= p.combatPower;
    if (p.side === "you") q.side = "you";
  }
  return true;
}

/** Adds a match unless it is logged already (the meter resends the last one), or merges it into the last as
 *  its next round. Returns whether anything changed. */
export function logMatch(log: ArenaLog, m: ArenaMatch): boolean {
  if (log.matches.some((x) => sameMatch(x, m))) return false;
  if (log.matches[0] && mergeRound(log.matches[0], m)) return true;
  log.matches.unshift(m);
  log.matches.length = Math.min(log.matches.length, MAX_MATCHES);
  return true;
}

/** Your side's damage and deaths against theirs. */
export function matchTotals(m: ArenaMatch) {
  const t = { dealt: 0, taken: 0, ourDeaths: 0, theirDeaths: 0, opponents: 0, ms: Math.max(0, m.playMs ?? m.endMs - m.startMs) };
  for (const p of m.players) {
    if (p.side === "opponent") { t.taken += p.dealt; t.theirDeaths += p.deaths; t.opponents++; }
    else { t.dealt += p.dealt; t.ourDeaths += p.deaths; }
  }
  return t;
}

/**
 * Maps the app can name itself. 20: the Abyss — the field-boss map that lists Argo, the Spirit King
 * (world-map boss 2001, an Abyss boss in A2Tools' table), and the game sends boss maps only for your home
 * world and the Abyss. Which layer (lower / upper) is not known. Everything else the player names.
 */
export const KNOWN_MAPS: Record<number, string> = { 20: "Abyss" };

/** A map's name: the player's, a known one, or "Map <id>". */
export const mapLabel = (maps: Record<string, string>, id: number) => maps[id] || KNOWN_MAPS[id] || `Map ${id}`;
