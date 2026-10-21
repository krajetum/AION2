// Arena matchup log: matches as the meter sends them ("arena"), map names the user gives. Pure.
import type { ArenaMatch } from "./meter.ts";

export interface ArenaLog {
  matches: ArenaMatch[]; // newest first, max MAX_MATCHES
  maps: Record<string, string>; // map id → name the user gave it
}

export const MAX_MATCHES = 100;

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
