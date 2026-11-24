import { test } from "node:test";
import assert from "node:assert/strict";
import { addWeeks, bestDays, callupFor, dayWindow, parseAvailability, CALLUP_LEADS, hourKind, NO_CLASS, withClasses, blockOf, classesOf, decodeWeek, emptyWeek, encodeWeek, freeBySlot, hoursFor, setDay, setRange, slotNow, slotOf, slotStart, unblocked, weekOf, WEEK_HOURS, type MemberAvailability } from "./raidplan.ts";

const B = [
  { day: 2, from: 9, to: 15, label: "Maintenance" },
  { day: 3, from: 21, to: 22, label: "Siege" },
  { day: 5, from: 21, to: 22, label: "Siege" },
];

test("a week round-trips through 42 hex digits; junk decodes empty", () => {
  const w = emptyWeek();
  [0, 5, 23, 24, 100, 167].forEach((i) => (w[i] = true));
  const hex = encodeWeek(w);
  assert.equal(hex.length, 42);
  assert.deepEqual(decodeWeek(hex), w);
  assert.equal(hex[0], "8");
  assert.deepEqual(decodeWeek("zz"), emptyWeek());
  assert.equal(decodeWeek(null).length, WEEK_HOURS);
});

test("blocked hours: Wednesday 9-15 maintenance, Thursday and Saturday 21-22 siege", () => {
  assert.equal(blockOf(slotOf(2, 9), B), "Maintenance");
  assert.equal(blockOf(slotOf(2, 14), B), "Maintenance");
  assert.equal(blockOf(slotOf(2, 15), B), null);
  assert.equal(blockOf(slotOf(3, 21), B), "Siege");
  assert.equal(blockOf(slotOf(5, 21), B), "Siege");
  assert.equal(blockOf(slotOf(5, 22), B), null);
  assert.equal(blockOf(slotOf(1, 21), B), null);
});

test("a range or a whole day never marks blocked hours free", () => {
  const w = setRange(emptyWeek(), 2, 8, 18, true, B);
  assert.deepEqual([...Array(24).keys()].filter((h) => w[slotOf(2, h)]), [8, 15, 16, 17]);
  const d = setDay(emptyWeek(), 5, true, B);
  assert.equal(d.slice(slotOf(5, 0), slotOf(6, 0)).filter(Boolean).length, 23);
  assert.equal(setDay(d, 5, false, B).some(Boolean), false);
  const all = Array(WEEK_HOURS).fill(true);
  assert.equal(unblocked(all, B).filter((v) => !v).length, 6 + 1 + 1);
});

test("weeks: Monday in Paris time, across DST; slot starts and now", () => {
  // Sunday 2026-11-15 15:52 CET → the week of Monday 9 November
  const sunday = Date.UTC(2026, 10, 15, 14, 52);
  assert.equal(weekOf(sunday, "Europe/Paris"), "2026-11-09");
  // Sunday 23:30 UTC = Monday 00:30 Paris: already the next week
  assert.equal(weekOf(Date.UTC(2026, 10, 15, 23, 30), "Europe/Paris"), "2026-11-16");
  assert.equal(addWeeks("2026-11-09", 1), "2026-11-16");
  assert.equal(addWeeks("2026-10-19", 1), "2026-10-26"); // DST ended 25 Oct: dates, not hours
  assert.equal(slotStart("2026-11-09", slotOf(5, 21), "Europe/Paris"), Date.UTC(2026, 10, 14, 20)); // Sat 21:00 CET = 20:00 UTC
  assert.equal(slotNow("2026-11-09", sunday, "Europe/Paris"), slotOf(6, 15));
  assert.equal(slotNow("2026-11-16", sunday, "Europe/Paris"), -1);
});

const enc = (fn: (w: boolean[]) => boolean[]) => encodeWeek(fn(emptyWeek()));
const member = (name: string, className: string, slots: string, weeks: Record<string, string> = {}): MemberAvailability => ({ name, className, slots, weeks, updatedMs: 1, serverId: null });

test("only this week: that week's hours replace every week's, other weeks keep them", () => {
  const every = enc((w) => setRange(w, 0, 18, 22, true, B));
  const thisWeek = enc((w) => setRange(w, 4, 12, 18, true, B));
  const m = member("A", "Chanter", every, { "2026-11-16": thisWeek });
  assert.equal(hoursFor(m, "2026-11-16")[slotOf(0, 19)], false);
  assert.equal(hoursFor(m, "2026-11-16")[slotOf(4, 12)], true);
  assert.equal(hoursFor(m, "2026-11-23")[slotOf(0, 19)], true);
  assert.equal(hoursFor(null, "2026-11-16").some(Boolean), false);
});

test("best days: most people at once, the longest stretch they share, who and which classes", () => {
  const W = "2026-11-16";
  const ms = [
    member("Ann", "Chanter", enc((w) => setRange(w, 4, 18, 23, true, B))),   // Fri 18-23
    member("Bob", "Templar", enc((w) => setRange(setRange(w, 4, 20, 23, true, B), 0, 20, 21, true, B))), // Fri 20-23, Mon 20
    member("Cid", "Chanter", enc((w) => setRange(w, 4, 19, 22, true, B))),   // Fri 19-22
    member("Dee", "", enc((w) => setRange(w, 5, 20, 23, true, B))),          // Sat 20-23 (21 = siege)
  ];
  const days = bestDays(ms, W);
  assert.deepEqual(days.map((d) => [d.day, d.count, d.from, d.to]), [[4, 3, 20, 22], [0, 1, 20, 21], [5, 1, 20, 21]]);
  assert.deepEqual(days[0].who.map((w) => w.name), ["Ann", "Bob", "Cid"]);
  assert.deepEqual(days[0].classes, [["Chanter", 2], ["Templar", 1]]);
  assert.equal(freeBySlot(ms, W)[slotOf(5, 21)].length, 0, "nobody at the siege hour");
  assert.deepEqual(classesOf([{ name: "x", className: "" }, { name: "y", className: "" }, { name: "z", className: "Ranger" }]), [["Ranger", 1], [NO_CLASS, 2]]);
});

test("hour colours: every week's free / not free, or only this week's change", () => {
  assert.equal(hourKind(true, false, false), "free");
  assert.equal(hourKind(false, true, false), "busy", "editing every week: the usual hours don't matter");
  assert.equal(hourKind(true, true, true), "free");
  assert.equal(hourKind(true, false, true), "freeWeek");
  assert.equal(hourKind(false, true, true), "busyWeek");
  assert.equal(hourKind(false, false, true), "busy");
});

test("a member without a class on their card takes the one found in their official profile", () => {
  const ms = [member("Ann", "", "0".repeat(42)), member("Bob", "Templar", "0".repeat(42)), member("Cid", "", "0".repeat(42))];
  const out = withClasses(ms, { Ann: "Cleric", Bob: "Ranger" });
  assert.deepEqual(out.map((m) => m.className), ["Cleric", "Templar", ""], "a class on the card wins; none found stays empty");
});

test("call-up from a day's best stretch: its first hour, @everyone, the names, now + 3 h + 1 h", () => {
  const W = "2026-11-16";
  const who = Array.from({ length: 9 }, (_, i) => ({ name: `P${i + 1}`, className: "Cleric" }));
  const d = { day: 4, count: 9, from: 20, to: 22, who, classes: [] as [string, number][] }; // Friday 20 November 20:00 Paris
  const at = Date.UTC(2026, 10, 20, 19); // 20:00 CET
  const now = at - 26 * 3_600_000;
  const c = callupFor(d, W, now, "Europe/Paris")!;
  assert.equal(c.atMs, at);
  assert.equal(c.ping, "everyone");
  assert.deepEqual(c.leads, [26 * 60, ...CALLUP_LEADS]);
  assert.match(c.message, /9 players are free 20:00–22:00/);
  assert.match(c.message, /Signed up: P1, P2, P3, P4, P5, P6, P7, P8, P9/);
  assert.match(c.message, /Your spot is not guaranteed\.$/);
  assert.deepEqual(callupFor(d, W, at - 90 * 60_000, "Europe/Paris")!.leads, [180, 90, 60], "under 3 h: 3 h is past, the Worker posts at once anyway");
  assert.equal(callupFor(d, W, at, "Europe/Paris"), null, "already begun");
  const many = { ...d, count: 200, who: Array.from({ length: 200 }, (_, i) => ({ name: `Player${i}`, className: "" })) };
  const long = callupFor(many, W, now, "Europe/Paris")!;
  assert.ok(long.message.length <= 500);
  assert.match(long.message, /and \d+ more\nYour spot/);
});

test("any day can be called: the hours picked, who is free for all of them, guests marked", () => {
  const W = "2026-11-16";
  const ann = { name: "Ann", className: "Cleric", serverId: 1, slots: encodeWeek(setRange(emptyWeek(), 4, 18, 23, true)), weeks: {}, updatedMs: 0 } as MemberAvailability;
  const sub = { name: "Sub", className: "Ranger", serverId: null, guest: true, slots: encodeWeek(setRange(emptyWeek(), 4, 20, 22, true)), weeks: {}, updatedMs: 0 } as MemberAvailability;
  const by = freeBySlot([ann, sub], W);
  assert.deepEqual(dayWindow(by, 4, 20, 22).who.map((w) => w.name), ["Ann", "Sub"]);
  assert.deepEqual(dayWindow(by, 4, 20, 23).who.map((w) => w.name), ["Ann"], "Sub leaves at 22");
  const empty = dayWindow(by, 1, 20, 23);
  assert.equal(empty.count, 0);
  const at = Date.UTC(2026, 10, 17, 19);
  const c = callupFor(empty, W, at - 5 * 3_600_000, "Europe/Paris")!;
  assert.equal(c.atMs, at);
  assert.equal(c.message, "Raid: Tuesday 20:00–23:00 (server time).\nYour spot is not guaranteed.");
  assert.match(callupFor(dayWindow(by, 4, 20, 22), W, Date.UTC(2026, 10, 16), "Europe/Paris")!.message, /Signed up: Ann, Sub \(guest\)/);
});

test("the Worker's guests come back as guests", () => {
  const r = parseAvailability({ mine: null, members: [], guests: [{ name: "Sub", className: "Ranger", slots: "0".repeat(42), weeks: {} }, { name: "", slots: "0".repeat(42) }] })!;
  assert.deepEqual(r.guests.map((g) => [g.name, g.guest, g.serverId]), [["Sub", true, null]]);
  assert.deepEqual(parseAvailability({ mine: null })!.guests, []);
});
