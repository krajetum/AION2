// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { bossBoard, bossesByMap, bossKey, bossState, dueBossAlerts, mergeBosses } from "./bosses.ts";
import type { BossAlert } from "./types.ts";

const MIN = 60_000;

test("boss alerts: armed bosses only, each lead once, last lead flagged, no late or unknown times", () => {
  const alerts: Record<string, BossAlert> = { 10: { leads: [10, 5], repeat: false } };
  const boss = b(1, 10, false, 100 * MIN, 0);
  const warned: Record<string, number> = {};
  assert.deepEqual(dueBossAlerts([boss, b(1, 11, false, 95 * MIN, 0)], alerts, warned, 80 * MIN), []);
  const first = dueBossAlerts([boss], alerts, warned, 91 * MIN);
  assert.deepEqual(first.map((d) => [d.leads, d.last, d.minutes]), [[[10], false, 9]]);
  warned[`${bossKey(boss)}@10`] = boss.timeMs;
  assert.deepEqual(dueBossAlerts([boss], alerts, warned, 92 * MIN), []);
  assert.deepEqual(dueBossAlerts([boss], alerts, warned, 96 * MIN).map((d) => [d.leads, d.last]), [[[5], true]]);
  // Opened late: both leads at once, so it is the last one too.
  assert.deepEqual(dueBossAlerts([boss], alerts, {}, 98 * MIN).map((d) => [d.leads, d.last]), [[[10, 5], true]]);
  assert.deepEqual(dueBossAlerts([b(1, 10, false, 50 * MIN, 0)], alerts, {}, 60 * MIN), [], "passed");
  assert.deepEqual(dueBossAlerts([b(1, 10, false, 0, 0)], alerts, {}, 60 * MIN), [], "no time");
  assert.deepEqual(dueBossAlerts([b(1, 10, true, 50 * MIN, 0)], alerts, {}, 52 * MIN), [], "up");
});

test("a recurrent alert fires again for the next respawn the map reports", () => {
  const alerts: Record<string, BossAlert> = { 10: { leads: [5], repeat: true } };
  const warned: Record<string, number> = {};
  const now1 = b(1, 10, false, 100 * MIN, 0);
  for (const d of dueBossAlerts([now1], alerts, warned, 97 * MIN)) warned[`${bossKey(d.boss)}@5`] = d.boss.timeMs;
  const next = b(1, 10, false, 220 * MIN, 150 * MIN);
  assert.equal(dueBossAlerts([next], alerts, warned, 216 * MIN).length, 1);
});

test("bosses by map: newest map first; up, due (soonest), passed, unknown", () => {
  const list = bossesByMap([
    b(1, 1, false, 0, 50), b(1, 2, false, 5, 50), b(1, 3, false, 300, 50), b(1, 4, true, 2, 50), b(1, 5, false, 100, 50),
    b(2, 9, true, 1, 90),
  ], 10);
  assert.deepEqual(list.map((m) => m.mapId), [2, 1]);
  assert.deepEqual(list[1].bosses.map((x) => x.bossId), [4, 5, 3, 2, 1]);
});
import type { BossTimer } from "./meter.ts";

const b = (mapId: number, bossId: number, up: boolean, timeMs: number, seenMs: number): BossTimer =>
  ({ mapId, bossId, name: `B${bossId}`, up, timeMs, seenMs });

test("a map read again replaces its bosses; nothing newer = no change", () => {
  const saved = [b(1, 10, false, 500, 100), b(2, 20, true, 50, 100)];
  assert.equal(mergeBosses(saved, [b(1, 10, false, 500, 100)]), undefined);
  assert.equal(mergeBosses(saved, []), undefined);
  assert.deepEqual(mergeBosses(saved, [b(1, 11, false, 900, 200), b(2, 20, true, 50, 100)]),
    [b(2, 20, true, 50, 100), b(1, 11, false, 900, 200)]);
  assert.deepEqual(mergeBosses([], [b(3, 30, false, 0, 1)]), [b(3, 30, false, 0, 1)]);
});

test("boss state and board order: next respawns, then up", () => {
  assert.equal(bossState(b(1, 1, true, 0, 0), 10), "up");
  assert.equal(bossState(b(1, 1, false, 0, 0), 10), "unknown");
  assert.equal(bossState(b(1, 1, false, 20, 0), 10), "due");
  assert.equal(bossState(b(1, 1, false, 5, 0), 10), "passed");
  const board = bossBoard([b(1, 1, true, 0, 5), b(1, 2, false, 300, 0), b(1, 3, false, 200, 0), b(1, 4, false, 5, 0)], 10);
  assert.deepEqual(board.map((x) => x.bossId), [3, 2, 1]);
  assert.equal(bossBoard([b(1, 2, false, 300, 0), b(1, 3, false, 200, 0)], 10, 1).length, 1);
});
