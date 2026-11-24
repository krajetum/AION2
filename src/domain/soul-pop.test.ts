import { test } from "node:test";
import assert from "node:assert/strict";
import { addGain, COMBO_MS, freshGains, isCombo, onFire, ON_FIRE, popGains, popText } from "./soul-pop.ts";

const names = { petNames: { "7": "Fluffy" }, kinds: {} };
const coll = { pets: [{ id: 7, level: 1, points: 3 }, { id: 9, level: 3, points: 0 }], atMs: 0 };

test("soul pop: only new points of pets still needed; crystals are no pet's shards", () => {
  const gains = [{ kind: 7, points: 2, atMs: 100 }, { kind: 9, points: 2, atMs: 200 }, { kind: 7, points: 1, atMs: 50 }];
  const f = freshGains(coll, gains, 60);
  assert.deepEqual(f.points.map((g) => g.atMs), [100]);
  assert.deepEqual(f.shards, []);
  assert.equal(f.lastMs, 200);
  // No collection read yet: every pet counts.
  assert.equal(freshGains(undefined, gains, 60).points.length, 2);
});

test("soul pop: gains within 3 s add up as a combo, on fire from the 10th, a new combo after a pause", () => {
  let p = addGain(null, 2, 0, "Fluffy", 1000);
  assert.deepEqual(p, { points: 2, shards: 0, hits: 1, lastMs: 1000, label: "Fluffy" });
  assert.equal(isCombo(p), false);
  p = addGain(p, 3, 0, "", 1000 + COMBO_MS);
  assert.equal(p.points, 5); assert.equal(p.hits, 2); assert.equal(isCombo(p), true); assert.equal(p.label, "Fluffy");
  for (let i = 0; i < ON_FIRE - 2; i++) p = addGain(p, 1, 0, "Fluffy", p.lastMs + 500);
  assert.equal(p.hits, ON_FIRE); assert.equal(onFire(p), true);
  p = addGain(p, 1, 1, "Other", p.lastMs + COMBO_MS + 1);
  assert.deepEqual(p, { points: 1, shards: 1, hits: 1, lastMs: p.lastMs, label: "Other" });
  assert.equal(popText(p), "+1 soul point · +1 shard");
});

test("soul pop: one update's gains in time order, named", () => {
  const f = freshGains(coll, [{ kind: 7, points: 1, atMs: 1500 }, { kind: 7, points: 2, atMs: 2000 }], 0);
  // Counted from when the app got them (5000), not the meter's times.
  const p = popGains(null, f, names, 5000)!;
  assert.deepEqual(p, { points: 3, shards: 0, hits: 2, lastMs: 5000, label: "Fluffy" });
  assert.equal(popGains(p, freshGains(coll, [], 0), names, 6000), null);
});

test("soul pop: the pet's progress after the gain", async () => {
  const { progressText } = await import("./soul-pop.ts");
  assert.equal(progressText(coll, 7), "3/25 to level 2");
  assert.equal(progressText(coll, 9), "level 3: done");
  assert.equal(progressText({ pets: [{ id: 4, level: 0, points: 2 }], atMs: 0 }, 4), "2/5 to unlock");
  assert.equal(progressText(coll, 1), undefined);
  assert.equal(progressText(undefined, 7), undefined);
});

test("the popup's duration: a listed number of seconds, else 3 s", async () => {
  const { soulPopupMs } = await import("./soul-pop.ts");
  assert.equal(soulPopupMs(8), 8000);
  assert.equal(soulPopupMs(7), 3000);
  assert.equal(soulPopupMs(undefined), 3000);
});
