// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ResetConfig } from "../config.ts";
import { learn, leftShare, plan } from "./planner.ts";
import type { Task } from "./types.ts";

const C: ResetConfig = {
  timeZone: "UTC",
  daily: { hour: 7, minute: 0 },
  weekly: { weekday: 3, hour: 7, minute: 0 },
  monthly: { day: 1, hour: 7, minute: 0 },
  cloudMerchantMinute: 0,
};
const Z = (s: string) => Date.parse(s);
const T = (id: string, minutes: number, extra: Partial<Task> = {}): Task =>
  ({ id, cadence: "weekly", category: "x", name: id, enabled: true, order: 0, minutes, ...extra });
const NOW = Z("2026-10-21T12:00:00Z"); // Wednesday after the weekly reset: daily resets in 19 h, weekly in 7 days
const base = { progress: {}, events: [], now: NOW, nextSessionHours: 20, config: C };
const ids = (p: ReturnType<typeof plan>) => p.steps.filter((s) => s.kind === "task").map((s) => s.id);

test("knapsack beats greedy: two 15-min tasks over one better-ratio 20-min task", () => {
  const p = plan({ ...base, minutes: 30, tasks: [T("A", 20, { priority: 3 }), T("B", 15), T("C", 15)] });
  assert.deepEqual(ids(p).sort(), ["B", "C"]);
  assert.deepEqual(p.skipped.map((s) => s.id), ["A"]);
});

test("a task resetting before the next session beats a higher-priority one that doesn't", () => {
  const p = plan({ ...base, minutes: 10, tasks: [T("weekly", 10, { priority: 2 }), T("daily", 10, { cadence: "daily", priority: 1 })] });
  assert.deepEqual(ids(p), ["daily"]);
  assert.equal(p.steps[0].urgent, true);
});

test("events are pinned at their time and a goal task is split around them", () => {
  const ev = { id: "shugo", name: "Shugo", everyHours: 1, minute: 0, firstHour: 0, duration: 10 };
  const now = Z("2026-10-21T12:50:00Z");
  const p = plan({ ...base, now, minutes: 40, events: [ev], tasks: [T("N", 30, { goals: [{ target: 30 }] })] });
  assert.deepEqual(p.steps.map((s) => [s.kind, s.start, s.minutes]), [
    ["task", now, 10], ["event", Z("2026-10-21T13:00:00Z"), 10], ["task", Z("2026-10-21T13:10:00Z"), 20],
  ]);
  assert.equal(p.end, Z("2026-10-21T13:30:00Z"));
});

test("progress shrinks the minutes left; done tasks are not candidates", () => {
  const t = T("N", 30, { goals: [{ target: 30 }, { target: 10 }] });
  assert.equal(leftShare(t, { done: false, counts: [15, 8] }), 0.5); // furthest-behind goal decides
  const p = plan({ ...base, minutes: 60, tasks: [t, T("D", 5)], progress: { N: { done: false, counts: [15, 8] }, D: { done: true } } });
  assert.equal(p.candidates, 1);
  assert.equal(p.steps[0].minutes, 15);
});

test("learning: moves the estimate, ignores instant ticks and AFK", () => {
  assert.equal(learn(10, 4, 1), 8);   // 0.7×10 + 0.3×4 = 8.2 → nearest half minute
  assert.equal(learn(10, 3, 0.5), 9); // half the task in 3 min = 6 min sample → 8.8
  assert.equal(learn(10, 0.05, 1), 10); // 3 s: ticked something done earlier
  assert.equal(learn(10, 90, 1), 10);   // 90 min: went AFK
});
