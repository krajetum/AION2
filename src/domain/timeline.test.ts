import assert from "node:assert/strict";
import { test } from "node:test";
import type { Fight, PlayerRow } from "./meter.ts";
import { burst, downtime, MAX_SECONDS, newTrack, opener, perSecond, sample, sampleTrack, smooth, trackSeries } from "./timeline.ts";

const fight = (ms: number, damage: number, isBoss = true): Fight =>
  ({ target: { name: "Boss", isBoss, maxHp: 1, currentHp: -1, damageDealt: 0 }, targetMode: "", battleTimeMs: ms, rows: [{ isYou: true, damage } as PlayerRow] });

test("updates become your damage per second; seconds with no update count as none", () => {
  let cum: number[] = [];
  for (const [ms, dmg] of [[200, 10], [800, 30], [1400, 50], [4100, 90]]) cum = sample(cum, fight(ms, dmg));
  assert.deepEqual(cum, [30, 50, 50, 50, 90]);
  assert.deepEqual(perSecond(cum), [30, 20, 0, 0, 40]);
});

test("only boss fights are sampled, and not past the cap", () => {
  assert.deepEqual(sample([], fight(500, 10, false)), []);
  assert.deepEqual(sample([5], fight(MAX_SECONDS * 1000, 10)), [5]);
  assert.deepEqual(sample([5], { ...fight(1500, 0), rows: [] }), [5, 5], "you are not in the rows: nothing gained");
});

test("the best burst, the opener and the downtime", () => {
  const t = [10, 10, 0, 0, 0, 50, 60, 40, 0, 10];
  assert.deepEqual(burst(t, 3), { dps: 50, at: 5 });
  assert.equal(burst(t, 11), null);
  assert.equal(opener(t, 2), 10);
  assert.equal(opener([4], 15), 4);
  assert.equal(opener([]), 0);
  assert.deepEqual(downtime(t), { idle: 4, longest: 3, at: 2, activeDps: 30 });
  assert.deepEqual(downtime([]), { idle: 0, longest: 0, at: 0, activeDps: 0 });
});

test("smoothing keeps the length and the total trend", () => {
  assert.deepEqual(smooth([0, 30, 0], 3), [15, 10, 15]);
});

test("the track keeps every row and the boss HP; the series are the biggest rows per second", () => {
  const f = (ms: number, hp: number, rows: [number, string, number][]): Fight => ({
    target: { name: "Boss", isBoss: true, maxHp: 100, currentHp: hp, damageDealt: 0 }, targetMode: "", battleTimeMs: ms,
    rows: rows.map(([id, name, damage]) => ({ id, name, damage, isYou: false }) as PlayerRow),
  });
  let t = newTrack();
  t = sampleTrack(t, f(500, 90, [[1, "A", 10]]));
  t = sampleTrack(t, f(2500, 50, [[1, "A", 30], [2, "B", 40]])); // B came late, second 1 had no update
  assert.deepEqual(t.rows, { 1: [10, 10, 30], 2: [0, 0, 40] });
  assert.deepEqual(t.hp, [90, 90, 50]);
  const rows = [{ id: 1, name: "A", damage: 30 }, { id: 2, name: "B", damage: 40 }, { id: 3, name: "", damage: 1 }] as PlayerRow[];
  assert.deepEqual(trackSeries(t, rows), { series: { B: [0, 0, 40], A: [10, 0, 20] }, hp: [90, 90, 50] });
  assert.deepEqual(Object.keys(trackSeries(t, rows, 1).series), ["B"], "only the biggest rows");
  assert.deepEqual(sampleTrack(newTrack(), { ...f(500, 90, [[1, "A", 1]]), target: null }), newTrack(), "no boss: nothing");
});
