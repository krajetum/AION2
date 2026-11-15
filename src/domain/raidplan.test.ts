import { test } from "node:test";
import assert from "node:assert/strict";
import { addWeeks, bestDays, hourKind, blockOf, classesOf, decodeWeek, emptyWeek, encodeWeek, freeBySlot, hoursFor, setDay, setRange, slotNow, slotOf, slotStart, unblocked, weekOf, WEEK_HOURS, type MemberAvailability } from "./raidplan.ts";

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
const member = (name: string, className: string, slots: string, weeks: Record<string, string> = {}): MemberAvailability => ({ name, className, slots, weeks, updatedMs: 1 });

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
  assert.deepEqual(classesOf([{ name: "x", className: "" }]), [["?", 1]]);
});

test("hour colours: every week's free / not free, or only this week's change", () => {
  assert.equal(hourKind(true, false, false), "free");
  assert.equal(hourKind(false, true, false), "busy", "editing every week: the usual hours don't matter");
  assert.equal(hourKind(true, true, true), "free");
  assert.equal(hourKind(true, false, true), "freeWeek");
  assert.equal(hourKind(false, true, true), "busyWeek");
  assert.equal(hourKind(false, false, true), "busy");
});
