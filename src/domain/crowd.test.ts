// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { bossesToShare, cubesToShare, MIN_EVERY, parseBosses, parseCubes } from "./crowd.ts";
import { emptyMap } from "./map.ts";
import type { BossTimer } from "./meter.ts";

const b = (mapId: number, bossId: number, timeMs: number, seenMs: number): BossTimer => ({ mapId, bossId, name: `Boss ${bossId}`, up: false, timeMs, seenMs });

test("bosses to share: only maps read since the saved ones, all their bosses", () => {
  const saved = [b(1, 10, 500, 100), b(2, 20, 500, 100)];
  assert.deepEqual(bossesToShare(saved, saved), [], "the meter resends the same maps");
  const fresh = [b(1, 10, 900, 300), b(1, 11, 0, 300), b(2, 20, 500, 100)];
  assert.deepEqual(bossesToShare(saved, fresh), [{ mapId: 1, timers: [fresh[0], fresh[1]] }]);
  // A map downloaded later than the meter's own read is not shared back (no echo).
  assert.deepEqual(bossesToShare([b(1, 10, 900, 400)], [b(1, 10, 900, 300)]), []);
});

test("cubes to share: new spots and later openings of a spot, new codes", () => {
  const map = { ...emptyMap(), found: [{ x: 0, y: 0, z: 0, code: 5, atMs: 100, byYou: true }] };
  const near = { x: 100, y: 0, z: 0, code: 5, atMs: 100, byYou: false };
  const far = { x: 5000, y: 0, z: 0, code: null, atMs: 50, byYou: false };
  const later = { ...near, atMs: 200 };
  const known = map.cubeCodes[0];
  assert.deepEqual(cubesToShare(map, [near, far, later], [known, 7]), { cubes: [far, later], codes: [7] });
});

test("parse bosses: onto the local clock, unknown times stay 0, bad rows dropped, every never under the minimum", () => {
  const j = {
    serverNow: 10_000, every: 300,
    maps: [{ mapId: 1, seenMs: 9_000, timers: [{ bossId: 10, name: "A", up: false, timeMs: 20_000 }, { bossId: 11, timeMs: 0, up: true }, { bossId: "x", timeMs: 1 }] }, { mapId: "bad" }],
  };
  const { timers, every } = parseBosses(j, 12_000);
  assert.equal(every, 300);
  assert.deepEqual(timers, [
    { mapId: 1, bossId: 10, name: "A", up: false, timeMs: 22_000, seenMs: 11_000 },
    { mapId: 1, bossId: 11, name: "", up: true, timeMs: 0, seenMs: 11_000 },
  ]);
  assert.deepEqual(parseBosses({ every: 5 }, 0), { timers: [], every: MIN_EVERY });
  assert.deepEqual(parseBosses(null, 0), { timers: [], every: MIN_EVERY });
});

test("parse cubes: clean spots and codes", () => {
  const j = { spots: [{ mapId: 1, x: 1, y: 2, z: 3, code: 9, n: 3 }, { mapId: 1, x: "a" }], codes: [9, -1, "z"] };
  assert.deepEqual(parseCubes(j), { spots: [{ mapId: 1, x: 1, y: 2, z: 3, code: 9, n: 3 }], codes: [9] });
  assert.deepEqual(parseCubes(undefined), { spots: [], codes: [] });
});
