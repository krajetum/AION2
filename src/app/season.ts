// Season Oath Coin use cases (per character).
import { emptySeason, SEASONAL, WEEKLY } from "../domain/season.ts";
import type { AppData } from "../domain/types.ts";

export const seasonOf = (data: AppData, charId: string) => (data.season[charId] ??= emptySeason());

const coins = (v: string) => Math.max(0, Math.round(+v) || 0);

export function setCoins(data: AppData, charId: string, v: string) { seasonOf(data, charId).coins = coins(v); }
export function setThisWeek(data: AppData, charId: string, v: string) { seasonOf(data, charId).thisWeek = coins(v); }

/** Coins claimed on SEASONAL[i]; 0 removes the entry. */
export function setClaimed(data: AppData, charId: string, i: number, v: string) {
  const s = seasonOf(data, charId), m = SEASONAL[i], c = coins(v);
  if (c) s.claimed[m.name] = c; else delete s.claimed[m.name];
}

/** Hard PvP flag of SEASONAL[i]; stored only when it differs from the mission's default. */
export function setHardPvp(data: AppData, charId: string, i: number, on: boolean) {
  const s = seasonOf(data, charId), m = SEASONAL[i];
  if (on === !!m.hardPvp) delete s.hardPvp[m.name]; else s.hardPvp[m.name] = on;
}

/** Whether WEEKLY[i] counts in the projection. */
export function setIncluded(data: AppData, charId: string, i: number, on: boolean) {
  const s = seasonOf(data, charId), m = WEEKLY[i];
  if (on) delete s.excluded[m.name]; else s.excluded[m.name] = true;
}
