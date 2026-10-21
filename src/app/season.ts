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

/** Steps done on SEASONAL[i] (clamped; all steps = fully claimed). Replaces a typed claimed amount. */
export function setSteps(data: AppData, charId: string, i: number, done: number) {
  const s = seasonOf(data, charId), m = SEASONAL[i], d = Math.max(0, Math.min(m.steps, Math.round(done) || 0));
  s.steps ??= {};
  if (d) s.steps[m.name] = d; else delete s.steps[m.name];
  delete s.claimed[m.name];
}

/** Steps done this week on WEEKLY[i]; a new week (`boundary` = last weekly reset) starts from nothing. */
export function setWeekSteps(data: AppData, charId: string, i: number, done: number, boundary: number) {
  const s = seasonOf(data, charId), m = WEEKLY[i], d = Math.max(0, Math.min(m.steps, Math.round(done) || 0));
  if (s.weekOf !== boundary) { s.weekSteps = {}; s.weekOf = boundary; }
  s.weekSteps ??= {};
  if (d) s.weekSteps[m.name] = d; else delete s.weekSteps[m.name];
}

/** Counted in the realistic projection = not hard PvP. */
export const setCounted = (data: AppData, charId: string, i: number, on: boolean) => setHardPvp(data, charId, i, !on);

/** Whether WEEKLY[i] counts in the projection. */
export function setIncluded(data: AppData, charId: string, i: number, on: boolean) {
  const s = seasonOf(data, charId), m = WEEKLY[i];
  if (on) delete s.excluded[m.name]; else s.excluded[m.name] = true;
}
