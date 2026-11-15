import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanHistory, dayStart, emptyHistory, MAX_CYCLES, MAX_KINA_DAYS, recordDaily, recordKina, streak, strip } from "./history.ts";

const DAY = 86_400_000;

test("a finished daily cycle is recorded once, the last ones kept", () => {
  const h = emptyHistory();
  recordDaily(h, "c", 0); // no reset applied yet: nothing to record
  recordDaily(h, "c", 2 * DAY);
  recordDaily(h, "c", 2 * DAY);
  recordDaily(h, "c", DAY);
  assert.deepEqual(h.dailies.c, [DAY, 2 * DAY]);
  for (let i = 3; i < 3 + MAX_CYCLES; i++) recordDaily(h, "c", i * DAY);
  assert.equal(h.dailies.c.length, MAX_CYCLES);
  assert.equal(h.dailies.c[0], 3 * DAY);
});

test("the strip and the streak: today counts once done and never breaks yesterday's run", () => {
  const h = emptyHistory();
  for (const d of [5, 6, 7, 9]) recordDaily(h, "c", d * DAY);
  const starts = [10, 9, 8, 7, 6, 5, 4].map((d) => d * DAY); // newest first: 10 is the running cycle
  assert.deepEqual(strip(h, "c", starts, false), [false, true, false, true, true, true, false]);
  assert.equal(streak(strip(h, "c", starts, false)), 1);
  assert.equal(streak(strip(h, "c", starts, true)), 2);
  assert.equal(streak(strip(h, "other", starts, false)), 0);
  assert.equal(streak([false, false, true]), 0);
  assert.equal(streak([]), 0);
});

test("Kina is kept once per day, as last seen", () => {
  const h = emptyHistory(), t = new Date(2026, 10, 15, 12).getTime();
  assert.equal(recordKina(h, "Me", {}, t), false); // the game sent no Kina yet
  assert.equal(recordKina(h, "Me", { 930100031: 100, 930100001: 5 }, t), true);
  assert.equal(recordKina(h, "Me", { 930100031: 100, 930100001: 5 }, t + 1000), false);
  assert.equal(recordKina(h, "Me", { 930100031: 250, 930100001: 5 }, t + 2000), true);
  assert.deepEqual(h.kina.Me, [[dayStart(t), 255]]);
  assert.equal(recordKina(h, "Me", { 930100031: 300 }, t + DAY), true);
  assert.equal(h.kina.Me.length, 2);
  for (let i = 2; i < 2 + MAX_KINA_DAYS; i++) recordKina(h, "Me", { 930100031: i }, t + i * DAY);
  assert.equal(h.kina.Me.length, MAX_KINA_DAYS);
});

test("old or broken history is cleaned", () => {
  assert.deepEqual(cleanHistory(undefined), emptyHistory());
  const h = cleanHistory({ dailies: { c: [3, "x", 1, 3, NaN], d: "no" }, kina: { Me: [[2, 20], [1, 10], ["a", 1], 5] } });
  assert.deepEqual(h, { dailies: { c: [1, 3] }, kina: { Me: [[1, 10], [2, 20]] } });
});
