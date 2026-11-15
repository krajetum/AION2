// Guild > Raid plan: each member marks the hours they are free in a week (Monday 00:00 to Sunday 24:00, RAID_PLAN.timeZone,
// one grid for the whole guild), every week or only for one week; officers see who is free when.
// A week = 168 hourly slots (day * 24 + hour, Monday = day 0), sent to the Worker as 42 hex digits (4 slots per digit, first slot = highest bit).
import { RAID_PLAN } from "../config.ts";
import { zonedParts, zonedToUtc } from "./time.ts";

export const WEEK_HOURS = 168;
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export type Week = boolean[]; // WEEK_HOURS entries

export const slotOf = (day: number, hour: number) => day * 24 + hour;
export const emptyWeek = (): Week => Array(WEEK_HOURS).fill(false);

export function encodeWeek(w: Week): string {
  let out = "";
  for (let i = 0; i < WEEK_HOURS; i += 4) out += ((+!!w[i] << 3) | (+!!w[i + 1] << 2) | (+!!w[i + 2] << 1) | +!!w[i + 3]).toString(16);
  return out;
}
/** 42 hex digits → a week; anything else → empty. */
export function decodeWeek(hex: unknown): Week {
  const w = emptyWeek();
  if (typeof hex !== "string" || !/^[0-9a-fA-F]{42}$/.test(hex)) return w;
  for (let i = 0; i < 42; i++) {
    const n = parseInt(hex[i], 16);
    for (let b = 0; b < 4; b++) w[i * 4 + b] = !!(n & (8 >> b));
  }
  return w;
}

type Block = { day: number; from: number; to: number; label: string };
/** What blocks an hour (maintenance, siege …), or null. */
export function blockOf(slot: number, blocked: Block[] = RAID_PLAN.blocked): string | null {
  const day = Math.floor(slot / 24), hour = slot % 24;
  return blocked.find((b) => b.day === day && hour >= b.from && hour < b.to)?.label ?? null;
}
/** A week with the blocked hours taken out. */
export const unblocked = (w: Week, blocked: Block[] = RAID_PLAN.blocked): Week => w.map((v, i) => v && !blockOf(i, blocked));

/** Free from `from` to `to` (hours, `to` excluded, 24 = midnight) on `day`, or not; blocked hours stay out. */
export function setRange(w: Week, day: number, from: number, to: number, free: boolean, blocked: Block[] = RAID_PLAN.blocked): Week {
  const out = [...w];
  for (let h = Math.max(0, from); h < Math.min(24, to); h++) out[slotOf(day, h)] = free && !blockOf(slotOf(day, h), blocked);
  return out;
}
/** A whole day free (all its hours that aren't blocked) or not. */
export const setDay = (w: Week, day: number, free: boolean, blocked: Block[] = RAID_PLAN.blocked) => setRange(w, day, 0, 24, free, blocked);

/** The Monday of the week holding `now`, in the plan's zone, as "YYYY-MM-DD" (the Worker's key for one week). */
export function weekOf(now: number, tz = RAID_PLAN.timeZone): string {
  const p = zonedParts(now, tz);
  const back = (p.weekday + 6) % 7; // days since Monday
  return new Date(Date.UTC(p.y, p.m0, p.d - back)).toISOString().slice(0, 10);
}
export const addWeeks = (week: string, n: number) => new Date(Date.parse(week + "T00:00:00Z") + n * 7 * 86_400_000).toISOString().slice(0, 10);
/** The instant an hour of a week starts (for "now" and labels). */
export function slotStart(week: string, slot: number, tz = RAID_PLAN.timeZone): number {
  const [y, m, d] = week.split("-").map(Number);
  return zonedToUtc(y, m - 1, d + Math.floor(slot / 24), slot % 24, 0, tz);
}
/** The hour `now` is in, within `week`, or -1. */
export function slotNow(week: string, now: number, tz = RAID_PLAN.timeZone): number {
  if (weekOf(now, tz) !== week) return -1;
  const p = zonedParts(now, tz);
  return slotOf((p.weekday + 6) % 7, p.h);
}

/** A member's hours as the Worker keeps them: every week's, and weeks that differ ("only this week"). */
export interface Availability { slots: string; weeks: Record<string, string>; updatedMs: number }
export interface MemberAvailability extends Availability { name: string; className: string }

/** The hours that count for `week`: that week's own when set, else every week's; blocked hours out. */
export const hoursFor = (a: Pick<Availability, "slots" | "weeks"> | null | undefined, week: string): Week =>
  a ? unblocked(decodeWeek(a.weeks[week] ?? a.slots)) : emptyWeek();
/** Whether `week` has its own hours (an "only this week" entry). */
export const ownWeek = (a: Pick<Availability, "weeks"> | null | undefined, week: string) => !!a?.weeks[week];

/**
 * How an hour of the grid is coloured: free / not free every week, or only this week (free this week but not usually,
 * or usually free but not this week). Editing every week's hours: only the first two.
 */
export type HourKind = "free" | "freeWeek" | "busy" | "busyWeek";
export function hourKind(free: boolean, usual: boolean, onlyThisWeek: boolean): HourKind {
  if (!onlyThisWeek || free === usual) return free ? "free" : "busy";
  return free ? "freeWeek" : "busyWeek";
}

/** The Worker's answer, checked; null when it isn't one. */
export function parseAvailability(j: any): { mine: Availability | null; members: MemberAvailability[] | null } | null {
  if (!j || typeof j !== "object") return null;
  const av = (a: any): Availability | null => a && typeof a.slots === "string" ? {
    slots: a.slots,
    weeks: a.weeks && typeof a.weeks === "object" ? Object.fromEntries(Object.entries(a.weeks).filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === "string")) as Record<string, string> : {},
    updatedMs: typeof a.updatedMs === "number" ? a.updatedMs : 0,
  } : null;
  const members = Array.isArray(j.members) ? j.members.flatMap((m: any) => {
    const a = av(m);
    return a && typeof m.name === "string" ? [{ ...a, name: m.name, className: typeof m.className === "string" ? m.className : "" }] : [];
  }) : null;
  return { mine: av(j.mine), members };
}

export interface Who { name: string; className: string }
/** Who is free at each hour of `week`. */
export function freeBySlot(members: MemberAvailability[], week: string): Who[][] {
  const out: Who[][] = Array.from({ length: WEEK_HOURS }, () => []);
  for (const m of members) {
    const h = hoursFor(m, week);
    h.forEach((free, i) => { if (free) out[i].push({ name: m.name, className: m.className }); });
  }
  return out;
}

/** A day's best stretch: the most people free at once, the longest run of hours with all of the same people, who and which classes. */
export interface DayPeak { day: number; count: number; from: number; to: number; who: Who[]; classes: [string, number][] }
export function bestDays(members: MemberAvailability[], week: string): DayPeak[] {
  const bySlot = freeBySlot(members, week);
  const days: DayPeak[] = [];
  for (let day = 0; day < 7; day++) {
    let best: DayPeak | null = null;
    for (let h = 0; h < 24; h++) {
      const who = bySlot[slotOf(day, h)];
      if (!who.length) continue;
      const names = new Set(who.map((w) => w.name));
      let to = h + 1; // extend while the same people (or more) stay free
      while (to < 24 && [...names].every((n) => bySlot[slotOf(day, to)].some((w) => w.name === n))) to++;
      if (!best || who.length > best.count || (who.length === best.count && to - h > best.to - best.from)) {
        best = { day, count: who.length, from: h, to, who, classes: classesOf(who) };
      }
    }
    if (best) days.push(best);
  }
  return days.sort((a, b) => b.count - a.count || (b.to - b.from) - (a.to - a.from) || a.day - b.day);
}
/** Classes and how many of each, most first ("" = class not known). */
export function classesOf(who: Who[]): [string, number][] {
  const n = new Map<string, number>();
  for (const w of who) n.set(w.className || "?", (n.get(w.className || "?") ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
export const hourLabel = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
