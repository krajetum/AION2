// Planner session use cases.
import type { ActivePlan, AppData } from "../domain/types.ts";

export const MIN = 60_000;

/** The running session for this character, if it hasn't run out. */
export function activePlan(data: AppData, charId: string, now: number) {
  const pl = data.plan;
  return pl && pl.charId === charId && now < pl.start + pl.minutes * MIN ? pl : undefined;
}

/** Minutes left in a session. */
export const planLeft = (pl: ActivePlan, now: number) => (pl.start + pl.minutes * MIN - now) / MIN;

export function startPlan(data: AppData, charId: string, now: number) {
  data.plan = { charId, start: now, minutes: data.settings.planMinutes, lastMark: now };
}

export function stopPlan(data: AppData) {
  delete data.plan;
}
