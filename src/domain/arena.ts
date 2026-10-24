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

export const sameMatch = (a: ArenaMatch, b: ArenaMatch) => a.mapId === b.mapId && a.startMs === b.startMs;

/** Adds a match unless it is logged already (the meter resends the last one). Returns whether it was new. */
export function logMatch(log: ArenaLog, m: ArenaMatch): boolean {
  if (log.matches.some((x) => sameMatch(x, m))) return false;
  log.matches.unshift(m);
  log.matches.length = Math.min(log.matches.length, MAX_MATCHES);
  return true;
}

/** Your side's damage and deaths against theirs. */
export function matchTotals(m: ArenaMatch) {
  const t = { dealt: 0, taken: 0, ourDeaths: 0, theirDeaths: 0, opponents: 0, ms: Math.max(0, m.endMs - m.startMs) };
  for (const p of m.players) {
    if (p.side === "opponent") { t.taken += p.dealt; t.theirDeaths += p.deaths; t.opponents++; }
    else { t.dealt += p.dealt; t.ourDeaths += p.deaths; }
  }
  return t;
}
