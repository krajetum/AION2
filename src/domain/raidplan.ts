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
export interface MemberAvailability extends Availability { name: string; className: string; /** null: not known (a card from before servers were kept) */ serverId: number | null; /** not in the static: a stand-in an officer added */ guest?: boolean }

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
export function parseAvailability(j: any): { mine: Availability | null; members: MemberAvailability[] | null; guests: MemberAvailability[] } | null {
  if (!j || typeof j !== "object") return null;
  const av = (a: any): Availability | null => a && typeof a.slots === "string" ? {
    slots: a.slots,
    weeks: a.weeks && typeof a.weeks === "object" ? Object.fromEntries(Object.entries(a.weeks).filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === "string")) as Record<string, string> : {},
    updatedMs: typeof a.updatedMs === "number" ? a.updatedMs : 0,
  } : null;
  const members = Array.isArray(j.members) ? j.members.flatMap((m: any) => {
    const a = av(m);
    return a && typeof m.name === "string" ? [{ ...a, name: m.name, className: typeof m.className === "string" ? m.className : "",
      serverId: typeof m.serverId === "number" && m.serverId > 0 ? m.serverId : null }] : [];
  }) : null;
  const guests = Array.isArray(j.guests) ? j.guests.flatMap((m: any) => {
    const a = av(m);
    return a && typeof m.name === "string" && m.name ? [{ ...a, name: m.name, className: typeof m.className === "string" ? m.className : "", serverId: null, guest: true }] : [];
  }) : [];
  return { mine: av(j.mine), members, guests };
}

export interface Who { name: string; className: string; guest?: boolean }
/** Who is free at each hour of `week`. */
export function freeBySlot(members: MemberAvailability[], week: string): Who[][] {
  const out: Who[][] = Array.from({ length: WEEK_HOURS }, () => []);
  for (const m of members) {
    const h = hoursFor(m, week);
    h.forEach((free, i) => { if (free) out[i].push({ name: m.name, className: m.className, ...(m.guest && { guest: true }) }); });
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
/** Shown for a member whose class neither their guild card nor their official profile gave. */
export const NO_CLASS = "Class unknown";
/** Classes and how many of each, most first; a missing class last-but-counted as NO_CLASS. */
export function classesOf(who: Who[]): [string, number][] {
  const n = new Map<string, number>();
  for (const w of who) n.set(w.className || NO_CLASS, (n.get(w.className || NO_CLASS) ?? 0) + 1);
  return [...n].sort((a, b) => +(a[0] === NO_CLASS) - +(b[0] === NO_CLASS) || b[1] - a[1] || a[0].localeCompare(b[0]));
}
/** Members whose guild card has no class (joined by typing a name, not seen by the meter) take the one found elsewhere. */
export const withClasses = <T extends Who>(members: T[], found: Record<string, string>): T[] =>
  members.map((m) => (m.className || !found[m.name] ? m : { ...m, className: found[m.name] }));
export const hourLabel = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;

/**
 * A call-up's hours on one day, `from` to `to` (24 = midnight): who is free for all of them. Every day can be called,
 * even with nobody free yet (the player's choice, 2026-11-24: stand-ins come from outside the plan).
 */
export function dayWindow(bySlot: Who[][], day: number, from: number, to: number): DayPeak {
  const hours = [...Array(Math.max(0, to - from)).keys()].map((i) => bySlot[slotOf(day, from + i)] ?? []);
  const who = hours.length ? hours[0].filter((w) => hours.every((h) => h.some((x) => x.name === w.name))) : [];
  return { day, count: who.length, from, to, who, classes: classesOf(who) };
}
/** A day's hours when nobody has marked any: the evening. */
export const DEFAULT_WINDOW = { from: 20, to: 23 };
/** Its reminders: one at once (a lead as long as the wait, which the Worker posts within a minute), 3 h and 1 h before. */
export const CALLUP_LEADS = [180, 60];
const MAX_MESSAGE = 500; // the Worker's call-up message limit (server/src/validate.ts)

/**
 * The call-up for a day's best stretch: at its first hour, @everyone, the names of those free and "Your spot is not
 * guaranteed", posted now, 3 h and 1 h before. Null once that hour has begun.
 */
export function callupFor(d: DayPeak, week: string, now: number, tz = RAID_PLAN.timeZone): { atMs: number; message: string; ping: "everyone"; leads: number[] } | null {
  const atMs = slotStart(week, slotOf(d.day, d.from), tz);
  const wait = Math.floor((atMs - now) / 60_000);
  if (wait < 1) return null;
  const tail = "\nYour spot is not guaranteed.";
  if (!d.who.length) return { atMs, message: `Raid: ${DAY_NAMES[d.day]} ${hourLabel(d.from)}–${hourLabel(d.to)} (server time).${tail}`, ping: "everyone", leads: [...new Set([wait, ...CALLUP_LEADS])].sort((a, b) => b - a) };
  const head = `Raid: ${d.count} ${d.count === 1 ? "player is" : "players are"} free ${hourLabel(d.from)}–${hourLabel(d.to)} (server time).\n`;
  const names = d.who.map((w) => (w.guest ? `${w.name} (guest)` : w.name));
  let list = names.join(", ");
  for (let n = names.length; n > 0 && head.length + "Signed up: ".length + list.length + tail.length > MAX_MESSAGE; n--) {
    list = `${names.slice(0, n - 1).join(", ")} and ${names.length - n + 1} more`;
  }
  return { atMs, message: `${head}Signed up: ${list}${tail}`, ping: "everyone", leads: [...new Set([wait, ...CALLUP_LEADS])].sort((a, b) => b - a) };
}
