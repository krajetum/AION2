// The winter theme: on from 1 December 00:00 to 6 January 23:59, local time, with an Advent calendar (1-24 December)
// whose doors open on their day or later and stay open for the season. Pure.

export const ADVENT_DAYS = 24;
/** How long the New Year fireworks last after midnight on 1 January. */
export const NEW_YEAR_MS = 60_000;

/** The Advent calendar's opened doors, for the season that starts in December of `year`. */
export interface Advent { year: number; opened: number[] }
export const emptyAdvent = (): Advent => ({ year: 0, opened: [] });

/** The season the date belongs to: December of Y and 1-6 January of Y+1 are season Y; null outside. */
export function winterYear(now: number): number | null {
  const d = new Date(now), m = d.getMonth();
  if (m === 11) return d.getFullYear();
  if (m === 0 && d.getDate() <= 6) return d.getFullYear() - 1;
  return null;
}
export const winterActive = (now: number): boolean => winterYear(now) !== null;

/** The last door that may be opened now: today's in December up to the 24th, all of them after; 0 outside the season. */
export function lastOpenable(now: number): number {
  const d = new Date(now);
  if (winterYear(now) === null) return 0;
  return d.getMonth() === 11 ? Math.min(d.getDate(), ADVENT_DAYS) : ADVENT_DAYS;
}
/** Today's door (1-24) in December, else null. */
export function adventToday(now: number): number | null {
  const d = new Date(now);
  return d.getMonth() === 11 && d.getDate() <= ADVENT_DAYS ? d.getDate() : null;
}
export const canOpen = (day: number, now: number): boolean => Number.isInteger(day) && day >= 1 && day <= lastOpenable(now);

/** The doors opened this season (an older season's count for nothing). */
export function openedNow(a: Advent, now: number): number[] {
  return a.year === winterYear(now) ? a.opened : [];
}
/** Opens a door: once, only on its day or later, and a new season starts from none opened. */
export function openDoor(a: Advent, day: number, now: number): Advent {
  const year = winterYear(now);
  if (year === null || !canOpen(day, now)) return a;
  const opened = a.year === year ? a.opened : [];
  return opened.includes(day) ? a : { year, opened: [...opened, day].sort((x, y) => x - y) };
}
/** Old or imported saves: whole days 1-24, no duplicates. */
export function cleanAdvent(raw: any): Advent {
  if (!raw || !Number.isInteger(raw.year) || !Array.isArray(raw.opened)) return emptyAdvent();
  const opened = [...new Set<number>(raw.opened.filter((d: unknown) => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= ADVENT_DAYS))];
  return { year: raw.year, opened: opened.sort((x, y) => x - y) };
}

/** The first minute of 1 January, local time: the fireworks. */
export function newYearShow(now: number): boolean {
  const d = new Date(now);
  return d.getMonth() === 0 && d.getDate() === 1 && now - new Date(d.getFullYear(), 0, 1).getTime() < NEW_YEAR_MS;
}
