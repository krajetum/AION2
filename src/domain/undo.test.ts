// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ResetConfig } from "../config.ts";
import { applyResets } from "./resets.ts";
import { lastBoundary } from "./time.ts";
import type { AppData } from "./types.ts";
import { lastUndo, popUndo, pushUndo } from "./undo.ts";

const C: ResetConfig = {
  timeZone: "UTC", daily: { hour: 7, minute: 0 }, weekly: { weekday: 3, hour: 7, minute: 0 },
  monthly: { day: 1, hour: 7, minute: 0 }, cloudMerchantMinute: 0,
};
const make = () => ({
  tasks: [{ id: "d", cadence: "daily" }, { id: "w", cadence: "weekly" }],
  progress: { a: {}, b: {} }, undo: [], lastReset: { daily: 0, weekly: 0, monthly: 0 },
}) as unknown as AppData;

test("undo restores the previous progress, null deletes it", () => {
  const d = make();
  pushUndo(d, "a", "W", { w: null }, 0);
  d.progress.a.w = { done: false, counts: [30, 10] };
  pushUndo(d, "a", "W", { w: structuredClone(d.progress.a.w) }, 10_000);
  d.progress.a.w = { done: true, counts: [30, 10] };
  assert.equal(popUndo(d, "a"), "W");
  assert.deepEqual(d.progress.a.w, { done: false, counts: [30, 10] });
  popUndo(d, "a");
  assert.equal("w" in d.progress.a, false);
  assert.equal(popUndo(d, "a"), undefined);
});

test("repeated changes to one task within 3 s are one undo; later ones are not", () => {
  const d = make();
  for (let i = 0; i < 5; i++) pushUndo(d, "a", "W", { w: i ? { done: false, counts: [i] } : null }, i * 500);
  assert.equal(d.undo.length, 1);
  assert.equal(d.undo[0].before.w, null); // back to before the whole burst
  pushUndo(d, "a", "W", { w: { done: false, counts: [5] } }, 10_000);
  assert.equal(d.undo.length, 2);
});

test("history is per character and capped at 30", () => {
  const d = make();
  for (let i = 0; i < 40; i++) pushUndo(d, "a", `t${i}`, { [`t${i}`]: null }, i * 10_000);
  pushUndo(d, "b", "B", { w: null }, 1e9);
  assert.equal(d.undo.length, 30);
  assert.equal(lastUndo(d, "a")!.label, "t39");
  assert.equal(popUndo(d, "b"), "B");
  assert.equal(lastUndo(d, "b"), undefined);
});

test("a game reset drops the undo entries of the tasks it cleared", () => {
  const d = make(), now = Date.parse("2026-10-15T10:00:00Z");
  d.lastReset = { daily: 0, weekly: lastBoundary("weekly", now, C), monthly: lastBoundary("monthly", now, C) };
  pushUndo(d, "a", "D", { d: null }, 0);
  pushUndo(d, "a", "W", { w: null }, 10_000);
  assert.deepEqual(applyResets(d, now, C), ["daily"]);
  assert.deepEqual(d.undo.map((e) => e.label), ["W"]);
});
