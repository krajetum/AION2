// Season Oath Coin planner (replaces the aion2_season_coin sheet). Pure: tested with `npm test`.
import type { ResetConfig } from "../config.ts";
import { nextBoundary, zonedToUtc } from "./time.ts";
import type { SeasonProgress } from "./types.ts";

/** One-time mission with several steps. hardPvp = default of the "Hard PvP" column. */
export interface SeasonalMission { tab: string; name: string; steps: number; coins: number; ap: number; hardPvp?: boolean; note?: string }
/** Repeats every weekly reset. */
export interface WeeklyMission { tab: string; name: string; steps: number; coins: number; ap: number; note?: string }

// Source: in-game screenshots via the user's sheet (2026-10-20).
const NM = "Assumption: no level claimed yet";
export const SEASONAL: SeasonalMission[] = [
  { tab: "Abyss", name: "Street Fighter (50→500 kill)", steps: 5, coins: 16700, ap: 33600, hardPvp: true, note: "Steps 2–5 = heavy PvP" },
  { tab: "Abyss", name: "Artifact Assault", steps: 3, coins: 6300, ap: 12600 },
  { tab: "Abyss", name: "Coins to Make Me Shine", steps: 4, coins: 4910, ap: 9820, note: "Step 3 may already be claimable (934k AP)" },
  { tab: "Abyss", name: "Wandering Wraith of the Floating Island", steps: 3, coins: 4710, ap: 8400 },
  { tab: "Abyss", name: "No Time to Rest", steps: 3, coins: 4200, ap: 8400 },
  { tab: "Abyss", name: "Peering into the Abyss", steps: 3, coins: 2940, ap: 5280 },
  { tab: "Abyss", name: "All I Have Is Two Wings", steps: 2, coins: 1940, ap: 3600 },
  { tab: "Abyss", name: "Scars of Glory", steps: 2, coins: 1340, ap: 2400 },
  { tab: "Arena", name: "Piercing the Enemy's Heart", steps: 4, coins: 5500, ap: 9820 },
  { tab: "Arena", name: "Reaper of the Arena", steps: 3, coins: 4200, ap: 8400 },
  { tab: "Arena", name: "Missed by a Hair", steps: 3, coins: 2940, ap: 5280 },
  { tab: "Arena", name: "Gambler's Path", steps: 3, coins: 2100, ap: 4200 },
  { tab: "Arena", name: "I Don't Fear Death", steps: 1, coins: 420, ap: 760 },
  { tab: "Transcendence", name: "Deus Research Base Stage 1", steps: 3, coins: 1460, ap: 0 },
  { tab: "Transcendence", name: "Deus Research Base Stage 2", steps: 3, coins: 2510, ap: 0 },
  { tab: "Transcendence", name: "Deus Research Base Stage 3", steps: 3, coins: 4080, ap: 0 },
  { tab: "Transcendence", name: "Deus Research Base Stage 4", steps: 3, coins: 5660, ap: 0 },
  { tab: "Transcendence", name: "Shattered Arkanis Stage 1", steps: 3, coins: 1460, ap: 0 },
  { tab: "Transcendence", name: "Shattered Arkanis Stage 2", steps: 3, coins: 2510, ap: 0 },
  { tab: "Transcendence", name: "Shattered Arkanis Stage 3", steps: 3, coins: 4080, ap: 0 },
  { tab: "Transcendence", name: "Shattered Arkanis Stage 4", steps: 3, coins: 5660, ap: 0 },
  { tab: "Nightmare", name: "Gatekeeper Pinopi", steps: 11, coins: 7690, ap: 0, note: NM },
  { tab: "Nightmare", name: "Furious Feruk", steps: 11, coins: 7690, ap: 0, note: NM },
  { tab: "Nightmare", name: "Fafnir's Poison Blood", steps: 11, coins: 7690, ap: 0, note: NM },
  { tab: "Nightmare", name: "Wraith Giselle", steps: 11, coins: 7690, ap: 0, note: "To be confirmed in game" },
  { tab: "Nightmare", name: "Fortress Guardian Notun", steps: 11, coins: 10770, ap: 0, note: NM },
  { tab: "Nightmare", name: "Mutated Gerod", steps: 11, coins: 10770, ap: 0, note: NM },
  { tab: "Nightmare", name: "Zikel's Apparition", steps: 11, coins: 15150, ap: 0, note: NM },
  { tab: "Challenge", name: "Tower of Trials", steps: 8, coins: 12660, ap: 0, note: "Step 5 (1,720) from client data" },
  { tab: "Challenge", name: "Hand-to-Hand Combat", steps: 5, coins: 8390, ap: 10000, note: "Step 5 ≥3,600 (truncated)" },
  { tab: "Challenge", name: "Waltzing with Commanders", steps: 2, coins: 5600, ap: 40000, hardPvp: true },
  { tab: "Challenge", name: "Waltzing with Generals", steps: 3, coins: 5400, ap: 30000, hardPvp: true },
  { tab: "Challenge", name: "Waltzing with Officers", steps: 3, coins: 4230, ap: 15000, hardPvp: true },
  { tab: "Challenge", name: "Tribulation of Aponos", steps: 3, coins: 2940, ap: 0 },
  { tab: "Challenge", name: "Tribulation of Duduri and Dodori", steps: 3, coins: 2940, ap: 0 },
];

// The sheet's 4 PvP-only weekly missions (no coin values, "Included = No") are left out.
export const WEEKLY: WeeklyMission[] = [
  { tab: "Abyss", name: "Purify Reshanta", steps: 10, coins: 5780, ap: 10190 },
  { tab: "Abyss", name: "Bare Minimum Morality", steps: 3, coins: 1680, ap: 2520 },
  { tab: "Abyss", name: "Watcher Kaira", steps: 3, coins: 1340, ap: 2010 },
  { tab: "Abyss", name: "Argo, the Spirit King", steps: 2, coins: 620, ap: 930 },
  { tab: "Abyss", name: "Land Grabs", steps: 2, coins: 530, ap: 930 },
  { tab: "Abyss", name: "Guardian Lord Nahma", steps: 1, coins: 400, ap: 600, note: "+1 item" },
  { tab: "Abyss", name: "Hometown of My Heart", steps: 1, coins: 300, ap: 450, note: "+1 item" },
  { tab: "Abyss", name: "Dominator of Lower Abyss", steps: 1, coins: 270, ap: 480 },
  { tab: "Abyss", name: "Down to the Last One", steps: 1, coins: 260, ap: 450 },
  { tab: "Arena", name: "Me, Beyond Myself", steps: 3, coins: 2140, ap: 3780 },
  { tab: "Arena", name: "Steady Efforts", steps: 3, coins: 1080, ap: 1890 },
  { tab: "Transcendence", name: "Way of the Transcended", steps: 3, coins: 5700, ap: 0 },
  { tab: "Transcendence", name: "Transforms Upon Death", steps: 2, coins: 1640, ap: 0 },
  { tab: "Transcendence", name: "Transcendence Speed Run", steps: 2, coins: 1640, ap: 0, note: "+Enhance Stone" },
  { tab: "Transcendence", name: "Toward Greater Power", steps: 2, coins: 1300, ap: 0 },
  { tab: "Transcendence", name: "Time to Go Home", steps: 1, coins: 1020, ap: 0, note: "+1 item" },
  { tab: "Nightmare", name: "Friends With a Story", steps: 2, coins: 1240, ap: 0 },
  { tab: "Nightmare", name: "Eternal Rest", steps: 1, coins: 720, ap: 0 },
  { tab: "Nightmare", name: "Collecting Dream Shards", steps: 2, coins: 480, ap: 0 },
  { tab: "Nightmare", name: "Nightmare Buster", steps: 1, coins: 420, ap: 0 },
  { tab: "Nightmare", name: "3 Minutes of Nightmare", steps: 1, coins: 200, ap: 0 },
  { tab: "Challenge", name: "Hatched Bird", steps: 3, coins: 1260, ap: 0 },
  { tab: "Challenge", name: "Daeva of Enduring Deeds", steps: 3, coins: 820, ap: 6000 },
  { tab: "Challenge", name: "Daeva of Glorious Deeds", steps: 3, coins: 820, ap: 6000 },
  { tab: "Challenge", name: "Daeva of Extraordinary Deeds", steps: 3, coins: 820, ap: 6000 },
  { tab: "Challenge", name: "Daeva's Book", steps: 3, coins: 820, ap: 6000 },
];

export const emptySeason = (): SeasonProgress => ({ coins: 0, thisWeek: 0, claimed: {}, hardPvp: {}, excluded: {} });
export const isHardPvp = (m: SeasonalMission, s: SeasonProgress) => s.hardPvp[m.name] ?? !!m.hardPvp;
export const isIncluded = (m: WeeklyMission, s: SeasonProgress) => !s.excluded[m.name];
/** Mission counted in the realistic projection: everything except the hard PvP ones (the "Counted" switch). */
export const isCounted = (m: SeasonalMission, s: SeasonProgress) => !isHardPvp(m, s);

/** Coins of `done` of `steps` steps. The coins of each step are not in the sheet, only the mission total:
 *  all steps = the total (exact), none = 0, in between = the steps' share of the total (an estimate). */
export function stepCoins(total: number, steps: number, done: number): { coins: number; exact: boolean } {
  const d = Math.max(0, Math.min(steps, done));
  if (d === 0) return { coins: 0, exact: true };
  if (d === steps) return { coins: total, exact: true };
  return { coins: Math.round(total * d / steps / 10) * 10, exact: false };
}

/** Steps done on a seasonal mission (0 when never ticked). */
export const stepsOf = (m: SeasonalMission, s: SeasonProgress) => s.steps?.[m.name] ?? 0;

/** Coins claimed on a seasonal mission: from the ticked steps; a typed amount (older saves) wins over an estimate. */
export function claimedOf(m: SeasonalMission, s: SeasonProgress): { coins: number; exact: boolean } {
  const done = stepsOf(m, s), typed = s.claimed[m.name];
  if (done >= m.steps) return { coins: m.coins, exact: true };
  if (typed !== undefined && typed > 0) return { coins: typed, exact: true };
  return stepCoins(m.coins, m.steps, done);
}
export const remainingOf = (m: SeasonalMission, s: SeasonProgress) => m.coins - claimedOf(m, s).coins;

/** Steps done this week on a weekly mission: 0 once the week (`boundary` = last weekly reset) has changed. */
export const weekStepsOf = (m: WeeklyMission, s: SeasonProgress, boundary: number) =>
  s.weekOf === boundary ? s.weekSteps?.[m.name] ?? 0 : 0;

/** What is still to claim this week, mission by mission (counted weekly missions not finished). */
export function weekLeft(s: SeasonProgress, boundary: number) {
  const list = WEEKLY.filter((m) => isIncluded(m, s)).map((m) => {
    const done = weekStepsOf(m, s, boundary), got = stepCoins(m.coins, m.steps, done);
    return { m, done, left: m.coins - got.coins, exact: got.exact };
  }).filter((x) => x.left > 0);
  return { list, coins: list.reduce((a, x) => a + x.left, 0), exact: list.every((x) => x.exact) };
}

/** Weekly resets still ahead before the season ends (season end at 00:00 in the reset time zone). */
export function weeksLeft(now: number, c: ResetConfig, end: string) {
  const [y, m, d] = end.split("-").map(Number);
  const endMs = zonedToUtc(y, m - 1, d, 0, 0, c.timeZone);
  let n = 0;
  for (let t = nextBoundary("weekly", now, c); t < endMs; t = nextBoundary("weekly", t, c)) n++;
  return n;
}

/** Same math as the sheet's Summary tab. With `weekBoundary` (the last weekly reset) "still to claim this week"
 *  comes from the weekly steps ticked; without it, from the typed `thisWeek` (older saves, the sheet). */
export function seasonSummary(s: SeasonProgress, weeks: number, weekBoundary?: number) {
  const weekly = WEEKLY.filter((m) => isIncluded(m, s));
  const weeklyCoins = weekly.reduce((a, m) => a + m.coins, 0);
  const weeklyAp = weekly.reduce((a, m) => a + m.ap, 0);
  const seasonalRemaining = SEASONAL.reduce((a, m) => a + remainingOf(m, s), 0);
  const hardPvpRemaining = SEASONAL.filter((m) => isHardPvp(m, s)).reduce((a, m) => a + remainingOf(m, s), 0);
  const futureWeekly = weeks * weeklyCoins;
  const thisWeek = weekBoundary === undefined ? s.thisWeek : weekLeft(s, weekBoundary).coins;
  const totalObtainable = futureWeekly + seasonalRemaining + thisWeek;
  const realistic = totalObtainable - hardPvpRemaining;
  const tabs = [...new Set(SEASONAL.map((m) => m.tab))].map((tab) => {
    const list = SEASONAL.filter((m) => m.tab === tab);
    return {
      tab,
      weekly: weekly.filter((m) => m.tab === tab).reduce((a, m) => a + m.coins, 0),
      total: list.reduce((a, m) => a + m.coins, 0),
      remaining: list.reduce((a, m) => a + remainingOf(m, s), 0),
    };
  });
  return {
    weeks, thisWeek, weeklyCoins, weeklyAp, futureWeekly, seasonalRemaining, totalObtainable, hardPvpRemaining, realistic,
    maxAtEnd: s.coins + totalObtainable, realisticEnd: s.coins + realistic, tabs,
  };
}
