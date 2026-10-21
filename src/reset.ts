// Pure reset logic: no Tauri dependency, tested with `npm test`.
import type { GameEvent, ResetConfig } from "./config.ts";
import { CADENCES, type AppData, type Cadence, type Progress, type Task } from "./types.ts";

/** Done = ticked manually or every goal reached. */
export function isDone(t: Task, p?: Progress) {
  if (p?.done) return true;
  return !!t.goals?.length && t.goals.every((g, i) => (p?.counts?.[i] ?? 0) >= g.target);
}

/** Enabled, unfinished tasks per character for one cadence. */
export function remaining(data: AppData, cad: Cadence) {
  return data.characters.map((ch) => ({
    name: ch.name,
    left: data.tasks.filter((t) => t.enabled && t.cadence === cad && !isDone(t, data.progress[ch.id]?.[t.id])).length,
  }));
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Wall-clock date/time in zone tz for instant utcMs. m0 = 0-based month. */
export function zonedParts(utcMs: number, tz: string) {
  const p: Record<string, number> = {};
  for (const x of fmt(tz).formatToParts(new Date(utcMs))) if (x.type !== "literal") p[x.type] = +x.value;
  const y = p.year, m0 = p.month - 1, d = p.day;
  return { y, m0, d, h: p.hour, min: p.minute, s: p.second, weekday: new Date(Date.UTC(y, m0, d)).getUTCDay() };
}

function offsetMs(utcMs: number, tz: string) {
  const p = zonedParts(utcMs, tz);
  return Date.UTC(p.y, p.m0, p.d, p.h, p.min, p.s) - Math.floor(utcMs / 1000) * 1000;
}

/** Wall-clock time in zone → UTC instant. Out-of-range days/months are fine (Date.UTC normalizes).
 *  Non-existent time (DST gap) → shifted forward; repeated time → second occurrence. */
export function zonedToUtc(y: number, m0: number, d: number, h: number, min: number, tz: string) {
  const guess = Date.UTC(y, m0, d, h, min);
  const t = guess - offsetMs(guess, tz);
  return guess - offsetMs(t, tz);
}

const daysIn = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

function monthly(y: number, m0: number, c: ResetConfig) {
  const n = new Date(Date.UTC(y, m0, 1)); // normalizes m0 = -1 / 12
  const yy = n.getUTCFullYear(), mm = n.getUTCMonth();
  return zonedToUtc(yy, mm, Math.min(c.monthly.day, daysIn(yy, mm)), c.monthly.hour, c.monthly.minute, c.timeZone);
}

/** Latest reset instant <= now. */
export function lastBoundary(cad: Cadence, now: number, c: ResetConfig): number {
  const p = zonedParts(now, c.timeZone), tz = c.timeZone;
  if (cad === "daily") {
    const t = zonedToUtc(p.y, p.m0, p.d, c.daily.hour, c.daily.minute, tz);
    return t <= now ? t : zonedToUtc(p.y, p.m0, p.d - 1, c.daily.hour, c.daily.minute, tz);
  }
  if (cad === "weekly") {
    const back = (p.weekday - c.weekly.weekday + 7) % 7;
    const t = zonedToUtc(p.y, p.m0, p.d - back, c.weekly.hour, c.weekly.minute, tz);
    return t <= now ? t : zonedToUtc(p.y, p.m0, p.d - back - 7, c.weekly.hour, c.weekly.minute, tz);
  }
  const t = monthly(p.y, p.m0, c);
  return t <= now ? t : monthly(p.y, p.m0 - 1, c);
}

/** Next reset instant > now. */
export function nextBoundary(cad: Cadence, now: number, c: ResetConfig): number {
  const p = zonedParts(now, c.timeZone), tz = c.timeZone;
  if (cad === "daily") {
    const t = zonedToUtc(p.y, p.m0, p.d, c.daily.hour, c.daily.minute, tz);
    return t > now ? t : zonedToUtc(p.y, p.m0, p.d + 1, c.daily.hour, c.daily.minute, tz);
  }
  if (cad === "weekly") {
    const fwd = (c.weekly.weekday - p.weekday + 7) % 7;
    const t = zonedToUtc(p.y, p.m0, p.d + fwd, c.weekly.hour, c.weekly.minute, tz);
    return t > now ? t : zonedToUtc(p.y, p.m0, p.d + fwd + 7, c.weekly.hour, c.weekly.minute, tz);
  }
  const t = monthly(p.y, p.m0, c);
  return t > now ? t : monthly(p.y, p.m0 + 1, c);
}

/** Clears tasks of every cadence whose reset passed since the last save
 *  (even if the app was closed). Returns the cadences that were reset. */
export function applyResets(data: AppData, now: number, c: ResetConfig): Cadence[] {
  const done: Cadence[] = [];
  for (const cad of CADENCES) {
    const b = lastBoundary(cad, now, c);
    if ((data.lastReset[cad] ?? 0) >= b) continue;
    const ids = new Set(data.tasks.filter((t) => t.cadence === cad).map((t) => t.id));
    for (const prog of Object.values(data.progress)) for (const id of ids) delete prog[id];
    data.lastReset[cad] = b;
    done.push(cad);
  }
  return done;
}

/** "2d 03:04:05" */
export function formatCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d ? d + "d " : ""}${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

/** Next start of a recurring event > now (event times are wall-clock in zone tz). */
export function nextEvent(ev: GameEvent, now: number, tz: string): number {
  const p = zonedParts(now, tz);
  for (let h = p.h; ; h++) {
    if ((((h - ev.firstHour) % ev.everyHours) + ev.everyHours) % ev.everyHours) continue;
    const t = zonedToUtc(p.y, p.m0, p.d, h, ev.minute, tz); // h ≥ 24 rolls into the next day
    if (t > now) return t;
  }
}

/** Event alert lead times (minutes): unique ints 1..60, longest first, max 3; nothing valid → [5]. */
export function cleanLeads(leads: unknown): number[] {
  const ok = (Array.isArray(leads) ? leads : []).map(Math.round).filter((n) => n >= 1 && n <= 60);
  const out = [...new Set(ok)].sort((a, b) => b - a).slice(0, 3);
  return out.length ? out : [5];
}

/** Lead times now due (msLeft ≤ lead) and not yet warned. The caller marks them all and toasts once. */
export const dueLeads = (leads: number[], msLeft: number, warned: (lead: number) => boolean) =>
  leads.filter((l) => msLeft <= l * 60_000 && !warned(l));
