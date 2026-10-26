// Run with: node --test "server/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { cellOf, MAX_CUBES, MAX_TIMERS, parseBossPost, parseCubePost, parseServerId, TIME_RANGE } from "./validate.ts";

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const ID = "0b9f6c7e-1a2b-4c3d-8e9f-0123456789AB";
const t = (bossId: number, timeMs: number, extra = {}) => ({ mapId: 999, bossId, name: "Boss", up: false, timeMs, seenMs: 1, ...extra });

test("boss post: clock shifted, seenMs stamped, mapId forced, unknown time kept at 0", () => {
  // Player clock 10 min fast.
  const p = parseBossPost({ install: ID, serverId: 2001, sentMs: NOW + 10 * MIN, maps: [{ mapId: 5, timers: [t(1, NOW + 40 * MIN), t(2, 0)] }] }, NOW);
  assert.deepEqual(p, {
    install: ID.toLowerCase(), serverId: 2001,
    maps: [{ mapId: 5, timers: [
      { mapId: 5, bossId: 1, name: "Boss", up: false, timeMs: NOW + 30 * MIN, seenMs: NOW },
      { mapId: 5, bossId: 2, name: "Boss", up: false, timeMs: 0, seenMs: NOW },
    ] }],
  });
});

test("boss post: bad timers dropped, names clamped, maps left empty skipped", () => {
  const p = parseBossPost({ install: ID, serverId: 1, sentMs: NOW, maps: [
    { mapId: 5, timers: [t(1, NOW + TIME_RANGE + 1), t(0, NOW), t(3, NaN), t(4, NOW, { up: "yes" }), t(5, NOW, { name: "x".repeat(99) }), t(6, NOW, { name: 7 })] },
    { mapId: 6, timers: [t(1, -5)] },
  ] }, NOW);
  assert.deepEqual(p?.maps.map((m) => m.timers.map((x) => [x.bossId, x.name.length])), [[[5, 64], [6, 0]]]);
});

test("boss post: whole body rejected when the frame is wrong", () => {
  const ok = { install: ID, serverId: 1, sentMs: NOW, maps: [] };
  assert.ok(parseBossPost(ok, NOW));
  for (const bad of [null, [], "x", { ...ok, install: "abc" }, { ...ok, serverId: 0 }, { ...ok, serverId: 1.5 },
    { ...ok, sentMs: "now" }, { ...ok, maps: {} }, { ...ok, maps: [{ mapId: -1, timers: [] }] },
    { ...ok, maps: [{ mapId: 1, timers: Array.from({ length: MAX_TIMERS + 1 }, (_, i) => t(i + 1, NOW)) }] }])
    assert.equal(parseBossPost(bad, NOW), null, JSON.stringify(bad)?.slice(0, 80));
});

test("cube post: shifted, null code kept, bad cubes and codes dropped", () => {
  const p = parseCubePost({ install: ID, sentMs: NOW - MIN, mapId: 20, codes: [1301199, 1301199, "x", -3], cubes: [
    { x: 1.5, y: 2, z: 3, code: 1301199, atMs: NOW - 2 * MIN },
    { x: 1, y: 2, z: 3, code: null, atMs: NOW },
    { x: Infinity, y: 2, z: 3, code: 1, atMs: NOW },
    { x: 1, y: 2, z: 3, code: 1, atMs: 0 },
    { x: 1, y: 2, z: 3, code: 2.5, atMs: NOW },
  ] }, NOW);
  assert.deepEqual(p, { install: ID.toLowerCase(), mapId: 20, codes: [1301199], cubes: [
    { x: 1.5, y: 2, z: 3, code: 1301199, atMs: NOW - MIN },
    { x: 1, y: 2, z: 3, code: null, atMs: NOW + MIN },
  ] });
  assert.equal(parseCubePost({ install: ID, sentMs: NOW, mapId: 20, cubes: Array(MAX_CUBES + 1).fill({}) }, NOW), null);
  assert.equal(parseCubePost({ install: ID, sentMs: NOW, mapId: 0, cubes: [] }, NOW), null);
  assert.deepEqual(parseCubePost({ install: ID, sentMs: NOW, mapId: 1, cubes: [] }, NOW)?.codes, []);
});

test("cells and server ids", () => {
  assert.equal(cellOf(299, -1), "0,-1");
  assert.equal(cellOf(300, 650), "1,2");
  assert.equal(parseServerId("2001"), 2001);
  for (const s of ["0", "-1", "1.5", "abc", "", "1e3", "9999999999"]) assert.equal(parseServerId(s), null, s);
});
