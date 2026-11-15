// Trophies: badges counted from what the app already keeps (pets, cubes, the Fight Log, the arena log, the season,
// the daily streak history, the Advent calendar). Each has tiers; nothing is stored, they are recomputed. Pure.
import type { FightRecord } from "./fights.ts";
import { personalBests } from "./fights.ts";
import { openedNow } from "./holiday.ts";
import { MAX_LEVEL } from "./pets.ts";
import { emptySeason, SEASONAL, stepsOf } from "./season.ts";
import type { AppData } from "./types.ts";

export interface Trophy {
  id: string;
  name: string;
  what: string; // what is counted
  value: number;
  tiers: number[]; // ascending: each one reached is a star
}

/** Stars earned: the tiers reached. */
export const stars = (t: Trophy) => t.tiers.filter((n) => t.value >= n).length;
/** The next tier to reach, or null with all of them earned. */
export const nextTier = (t: Trophy) => t.tiers.find((n) => t.value < n) ?? null;
/** Progress towards the next tier, 0..1 from the tier before it (1 with every tier earned). */
export function progress(t: Trophy): number {
  const next = nextTier(t);
  if (next === null) return 1;
  const prev = t.tiers[stars(t) - 1] ?? 0;
  return Math.max(0, Math.min(1, (t.value - prev) / (next - prev)));
}

/** Every trophy for one character (`charId`: the season and the streak are per character; the rest is the install's). */
export function trophies(data: AppData, fights: FightRecord[], charId: string, now: number): Trophy[] {
  const best = (lists: number[]) => Math.max(0, ...lists);
  const season = data.season[charId] ?? emptySeason();
  return [
    { id: "pets", name: "Collector", what: `Pets at level ${MAX_LEVEL}`, tiers: [1, 10, 50, 100, 200],
      value: best(Object.values(data.pets).map((c) => c.pets.filter((p) => p.level >= MAX_LEVEL).length)) },
    { id: "cubes", name: "Cube hunter", what: "Hidden cubes you opened", tiers: [1, 10, 50, 100, 250],
      value: data.map.found.filter((c) => c.byYou).length },
    { id: "kills", name: "Boss slayer", what: "Boss kills in the Fight Log", tiers: [1, 10, 50, 100, 250],
      value: fights.filter((f) => f.killed).length },
    { id: "bosses", name: "Well travelled", what: "Different bosses fought", tiers: [1, 5, 10, 25, 50],
      value: Object.keys(personalBests(fights)).length },
    { id: "arena", name: "Duelist", what: "Arena matches logged", tiers: [1, 10, 25, 50, 100],
      value: data.arena.matches.length },
    { id: "pvp", name: "Daeva hunter", what: "PvP kills in the kill history", tiers: [1, 10, 50, 100, 250],
      value: data.arena.kills.filter((k) => k.kind === "kill").length },
    { id: "season", name: "Oath keeper", what: "Season missions fully claimed", tiers: [1, 5, 10, 20, SEASONAL.length],
      value: SEASONAL.filter((m) => stepsOf(m, season) >= m.steps).length },
    { id: "days", name: "Perfect days", what: "Days with every daily done (last 60)", tiers: [1, 7, 14, 30, 60],
      value: (data.history.dailies[charId] ?? []).length },
    { id: "advent", name: "Advent", what: "Doors opened this winter", tiers: [1, 12, 24],
      value: openedNow(data.advent, now).length },
  ];
}

/** Stars earned over stars there are, for the sidebar. */
export function tally(list: Trophy[]): { earned: number; total: number } {
  return { earned: list.reduce((n, t) => n + stars(t), 0), total: list.reduce((n, t) => n + t.tiers.length, 0) };
}
