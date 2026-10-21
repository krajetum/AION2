// Run with: npm test   (node --test, no dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ResetConfig } from "../config.ts";
import type { AppData } from "./types.ts";
import { cleanLeads, dueLeads } from "./alerts.ts";
import { applyResets } from "./resets.ts";
import { formatCountdown, lastBoundary, nextBoundary, nextEvent, zonedToUtc } from "./time.ts";

// Fixed test config (independent from the TO VERIFY values in config.ts).
const C: ResetConfig = {
  timeZone: "Europe/Rome",
  daily: { hour: 5, minute: 0 },
  weekly: { weekday: 3, hour: 5, minute: 0 }, // Wednesday
  monthly: { day: 1, hour: 5, minute: 0 },
  cloudMerchantMinute: 0,
};
const Z = (iso: string) => Date.parse(iso); // UTC instant
const H = 3600_000;

test("daily: before and after 05:00 (winter, CET)", () => {
  assert.equal(lastBoundary("daily", Z("2026-01-10T03:59:00Z"), C), Z("2026-01-09T04:00:00Z"));
  assert.equal(lastBoundary("daily", Z("2026-01-10T04:00:00Z"), C), Z("2026-01-10T04:00:00Z")); // exactly on the reset
  assert.equal(nextBoundary("daily", Z("2026-01-10T04:00:00Z"), C), Z("2026-01-11T04:00:00Z"));
});

test("spring DST (2026-03-29): 23-hour day", () => {
  assert.equal(lastBoundary("daily", Z("2026-03-29T12:00:00Z"), C), Z("2026-03-29T03:00:00Z"));
  const from = Z("2026-03-28T11:00:00Z"); // 12:00 CET
  const next = nextBoundary("daily", from, C);
  assert.equal(next, Z("2026-03-29T03:00:00Z")); // 05:00 CEST
  assert.equal(next - from, 16 * H); // 17 wall-clock hours but 16 real hours
  assert.equal(formatCountdown(next - from), "16:00:00");
});

test("autumn DST (2026-10-25): 25-hour day", () => {
  const a = lastBoundary("daily", Z("2026-10-24T12:00:00Z"), C);
  const b = lastBoundary("daily", Z("2026-10-25T12:00:00Z"), C);
  assert.equal(a, Z("2026-10-24T03:00:00Z"));
  assert.equal(b, Z("2026-10-25T04:00:00Z"));
  assert.equal(b - a, 25 * H);
});

test("non-existent reset time (02:30 in the gap) → shifted forward", () => {
  assert.equal(zonedToUtc(2026, 2, 29, 2, 30, "Europe/Rome"), Z("2026-03-29T01:30:00Z")); // 03:30 CEST
});

test("weekly: Wednesday 05:00, also across the DST change", () => {
  const thu = Z("2026-10-15T10:00:00Z");
  assert.equal(lastBoundary("weekly", thu, C), Z("2026-10-14T03:00:00Z"));
  assert.equal(nextBoundary("weekly", thu, C), Z("2026-10-21T03:00:00Z"));
  const mon = Z("2026-10-26T10:00:00Z"); // after the switch back to standard time
  assert.equal(lastBoundary("weekly", mon, C), Z("2026-10-21T03:00:00Z"));
  assert.equal(nextBoundary("weekly", mon, C), Z("2026-10-28T04:00:00Z"));
  // Wednesday before 05:00 → previous week's reset
  assert.equal(lastBoundary("weekly", Z("2026-10-14T02:00:00Z"), C), Z("2026-10-07T03:00:00Z"));
});

test("monthly: month and year rollover", () => {
  const ny = Z("2027-01-01T03:00:00Z"); // 04:00 in Rome, before the reset
  assert.equal(lastBoundary("monthly", ny, C), Z("2026-12-01T04:00:00Z"));
  assert.equal(nextBoundary("monthly", ny, C), Z("2027-01-01T04:00:00Z"));
  assert.equal(nextBoundary("monthly", Z("2026-12-20T00:00:00Z"), C), Z("2027-01-01T04:00:00Z"));
});

test("monthly day 31 → last day in short months (leap years too)", () => {
  const c31 = { ...C, monthly: { day: 31, hour: 5, minute: 0 } };
  assert.equal(lastBoundary("monthly", Z("2026-03-15T00:00:00Z"), c31), Z("2026-02-28T04:00:00Z"));
  assert.equal(nextBoundary("monthly", Z("2028-02-10T00:00:00Z"), c31), Z("2028-02-29T04:00:00Z"));
  assert.equal(nextBoundary("monthly", Z("2026-04-10T00:00:00Z"), c31), Z("2026-04-30T03:00:00Z"));
});

function makeData(): AppData {
  const tasks = (["daily", "weekly", "monthly"] as const).map((cadence, i) => ({
    id: cadence, cadence, category: "x", name: cadence, enabled: true, order: i,
  }));
  const full = { daily: { done: true }, weekly: { done: true }, monthly: { done: true } };
  return {
    version: 1, tasks, characters: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
    progress: { a: { ...full }, b: { ...full } },
    lastReset: { daily: 0, weekly: 0, monthly: 0 }, warned: { daily: 0, weekly: 0, monthly: 0 },
    lastCloudHour: 0, warnedEvent: {}, news: [], lastNewsGid: "",
    settings: { channels: {}, warnHours: { daily: 2, weekly: 12, monthly: 24 }, quietStart: "01:00", quietEnd: "09:00", mutedUntil: 0, sound: true, volume: 70 },
  };
}

test("app closed for 10 days: daily and weekly reset, monthly not (same month)", () => {
  const d = makeData();
  const closedAt = Z("2026-10-05T10:00:00Z");
  for (const cad of ["daily", "weekly", "monthly"] as const) d.lastReset[cad] = lastBoundary(cad, closedAt, C);
  const now = Z("2026-10-15T10:00:00Z");
  assert.deepEqual(applyResets(d, now, C), ["daily", "weekly"]);
  assert.deepEqual(d.progress.a, { monthly: { done: true } });
  assert.deepEqual(d.progress.b, { monthly: { done: true } });
  assert.equal(d.lastReset.daily, Z("2026-10-15T03:00:00Z"));
  assert.deepEqual(applyResets(d, now, C), []); // idempotent
});

test("only weekly expired: daily tasks stay", () => {
  const d = makeData();
  const now = Z("2026-10-14T03:00:00Z"); // exactly the weekly reset
  d.lastReset = { daily: now, weekly: Z("2026-10-07T03:00:00Z"), monthly: Z("2026-10-01T03:00:00Z") };
  assert.deepEqual(applyResets(d, now, C), ["weekly"]);
  assert.deepEqual(Object.keys(d.progress.a).sort(), ["daily", "monthly"]);
});

test("formatted countdown", () => {
  assert.equal(formatCountdown(2 * 86400_000 + 3 * H + 4 * 60_000 + 5000), "2d 03:04:05");
  assert.equal(formatCountdown(-5), "00:00:00");
});

test("events: hourly at :30 and every 3h across midnight", () => {
  const inv = { id: "i", name: "I", everyHours: 1, minute: 30, firstHour: 0, duration: 10 };
  assert.equal(nextEvent(inv, Z("2026-10-15T10:29:00Z"), "UTC"), Z("2026-10-15T10:30:00Z"));
  assert.equal(nextEvent(inv, Z("2026-10-15T10:30:00Z"), "UTC"), Z("2026-10-15T11:30:00Z")); // exactly at start → next
  const rift = { id: "r", name: "R", everyHours: 3, minute: 0, firstHour: 2, duration: 15 };
  assert.equal(nextEvent(rift, Z("2026-10-15T03:00:00Z"), "UTC"), Z("2026-10-15T05:00:00Z"));
  assert.equal(nextEvent(rift, Z("2026-10-15T23:10:00Z"), "UTC"), Z("2026-10-16T02:00:00Z"));
  assert.equal(nextEvent(rift, Z("2026-10-15T00:30:00Z"), "UTC"), Z("2026-10-15T02:00:00Z"));
});

test("event alert lead times", () => {
  assert.deepEqual(cleanLeads(undefined), [5]);
  assert.deepEqual(cleanLeads([1, 5, 5, 0, 90, 10, 3]), [10, 5, 3]);
  const warned = new Set<number>(), mark = (due: number[]) => (due.forEach((l) => warned.add(l)), due);
  const due = (msLeft: number) => mark(dueLeads([5, 1], msLeft, (l) => warned.has(l)));
  assert.deepEqual(due(6 * 60_000), []);
  assert.deepEqual(due(5 * 60_000), [5]);
  assert.deepEqual(due(4 * 60_000), []);       // 5 already sent
  assert.deepEqual(due(50_000), [1]);
  // App opened late: every passed lead is due at once (the caller toasts once).
  assert.deepEqual(dueLeads([10, 5, 1], 30_000, () => false), [10, 5, 1]);
});
