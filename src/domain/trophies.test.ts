import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultData } from "./save-file.ts";
import { nextTier, progress, stars, tally, trophies, type Trophy } from "./trophies.ts";

const t = (value: number, tiers = [1, 10, 50]): Trophy => ({ id: "x", name: "X", what: "", value, tiers });

test("stars, the next tier and the progress towards it", () => {
  assert.equal(stars(t(0)), 0);
  assert.equal(nextTier(t(0)), 1);
  assert.equal(stars(t(10)), 2);
  assert.equal(nextTier(t(10)), 50);
  assert.equal(progress(t(30)), 0.5); // half way from 10 to 50
  assert.equal(stars(t(99)), 3);
  assert.equal(nextTier(t(99)), null);
  assert.equal(progress(t(99)), 1);
});

test("trophies count what the app keeps; a fresh install has none", () => {
  const d = defaultData(), c = d.characters[0].id, now = new Date(2026, 5, 1).getTime();
  assert.deepEqual(tally(trophies(d, [], c, now)).earned, 0);
  d.map.found = [{ x: 0, y: 0, z: 0, code: null, atMs: 1, byYou: true }, { x: 1, y: 1, z: 0, code: null, atMs: 2, byYou: false }];
  d.history.dailies[c] = [1, 2, 3, 4, 5, 6, 7];
  d.pets.Me = { atMs: 1, pets: [{ id: 1, level: 3, points: 0 }, { id: 2, level: 2, points: 0 }] };
  const by = Object.fromEntries(trophies(d, [], c, now).map((x) => [x.id, x]));
  assert.equal(by.cubes.value, 1);
  assert.equal(stars(by.days), 2);
  assert.equal(by.pets.value, 1);
  assert.equal(tally(Object.values(by)).earned, 4);
  // Every trophy's tiers go up, so "the next tier" is always the smallest not reached.
  for (const x of Object.values(by)) assert.deepEqual(x.tiers, [...x.tiers].sort((a, b) => a - b), x.id);
});
