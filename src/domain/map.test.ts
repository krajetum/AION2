// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAffine, bearing, BUNDLED_FIT, climb, cleanMap, emptyMap, takeCubes, clusters, fitAffine, fitError, fitView, toImage, toScreen, zoomAt, type MapPoint } from "./map.ts";

const pt = (id: string, x: number, y: number): MapPoint => ({ id, x, y, kind: "cube", group: 0, label: "" });

test("fit view centres the whole image", () => {
  const v = fitView(2000, 1000, 1000, 1000);
  assert.deepEqual(v, { scale: 0.5, x: 0, y: 250 });
});

test("zoom keeps the point under the cursor still, within limits", () => {
  const v = { scale: 1, x: 10, y: 20 };
  const before = toImage(v, 300, 200);
  const z = zoomAt(v, 2, 300, 200, 0.1, 4);
  assert.equal(z.scale, 2);
  const after = toScreen(z, before.x, before.y);
  assert.ok(Math.abs(after.x - 300) < 1e-9 && Math.abs(after.y - 200) < 1e-9);
  assert.equal(zoomAt(v, 100, 0, 0, 0.1, 4).scale, 4);
  assert.equal(zoomAt(v, 0.001, 0, 0, 0.1, 4).scale, 0.1);
});

test("close points cluster when zoomed out and split when zoomed in", () => {
  const ps = [pt("a", 100, 100), pt("b", 110, 100), pt("c", 400, 100)];
  const far = clusters(ps, { scale: 0.5, x: 0, y: 0 }, 20); // a, b 5 px apart on screen
  assert.deepEqual(far.map((c) => c.points.map((p) => p.id)), [["a", "b"], ["c"]]);
  assert.deepEqual([far[0].x, far[0].y], [52.5, 50]);
  const near = clusters(ps, { scale: 4, x: 0, y: 0 }, 20); // 40 px apart
  assert.equal(near.length, 3);
});

test("affine fit recovers a known mapping and reports its error", () => {
  const t = (gx: number, gy: number) => ({ x: 0.25 * gx + 120, y: -0.25 * gy + 3000 }); // y flipped, as maps often are
  const refs = [[0, 0], [4000, 0], [0, 8000], [6000, 6000]].map(([gx, gy]) => ({ game: { x: gx, y: gy }, ...t(gx, gy) }));
  const fit = fitAffine(refs)!;
  const p = applyAffine(fit, 1000, 2000);
  assert.ok(Math.abs(p.x - 370) < 1e-6 && Math.abs(p.y - 2500) < 1e-6, JSON.stringify(p));
  assert.ok(fitError(fit, refs) < 1e-6);
  refs[3].x += 9; // a click 9 px off
  assert.ok(fitError(fitAffine(refs)!, refs) > 1);
});

test("affine fit needs three references off one line", () => {
  const r = (gx: number, gy: number) => ({ game: { x: gx, y: gy }, x: gx, y: gy });
  assert.equal(fitAffine([r(0, 0), r(1, 1)]), null);
  assert.equal(fitAffine([r(0, 0), r(1, 1), r(2, 2)]), null);
  assert.notEqual(fitAffine([r(0, 0), r(1, 0), r(0, 1)]), null);
});

test("saved points are cleaned, bad ones dropped", () => {
  const m = cleanMap({ points: [
    { id: "a", x: 1, y: 2, kind: "ref", group: 3, label: "Obelisk", game: { x: 5, y: 6 } },
    { id: "b", x: 1, y: 2, kind: "weird", group: 99, game: { x: "?" } },
    { id: "c", x: "1", y: 2 },
    null,
  ] });
  assert.deepEqual(m.points, [
    { id: "a", x: 1, y: 2, kind: "ref", group: 3, label: "Obelisk", game: { x: 5, y: 6 } },
    { id: "b", x: 1, y: 2, kind: "cube", group: 0, label: "" },
  ]);
  assert.deepEqual(cleanMap(undefined).points, []);
});

test("bundled fit puts the recorded teleports where the screenshots show them", () => {
  const near = (gx: number, gy: number, px: number, py: number, tol: number) => {
    const p = applyAffine(BUNDLED_FIT, gx, gy);
    assert.ok(Math.hypot(p.x - px, p.y - py) < tol, `${gx},${gy} → ${p.x.toFixed(0)},${p.y.toFixed(0)}, expected ${px},${py}`);
  };
  near(109370, 189246, 2096, 2719, 5); // obelisk near Black Claw Village
  near(189516, -91914, 2517, 1151, 5); // Basfelt Ruins, arrow after the teleport
  near(-86370, -158622, 1023, 776, 12); // walked spots
  near(-43409, -150745, 1255, 829, 20);
});

test("cube openings join the save once per spot; codes are learned", () => {
  const m = emptyMap();
  const o = (x: number, y: number, atMs: number, code: number | null = null) => ({ x, y, z: 0, code, atMs, byYou: true });
  assert.equal(takeCubes(m, [1301199], [o(1000, 1000, 1)]), true);
  assert.equal(takeCubes(m, [1301199], [o(1000, 1000, 1)]), false, "same news again");
  assert.equal(takeCubes(m, [], [o(1100, 1050, 5, 42)]), true, "same spot, later: refreshed");
  assert.deepEqual(m.found, [{ x: 1000, y: 1000, z: 0, code: 42, atMs: 5, byYou: true }]);
  takeCubes(m, [77], [o(5000, 1000, 6)]);
  assert.equal(m.found.length, 2);
  assert.deepEqual(m.cubeCodes, [77, 1301199]);
});

test("bearing: map up is north, y grows south", () => {
  assert.deepEqual(bearing({ x: 0, y: 0 }, { x: 0, y: -500 }), { dist: 500, dir: "N", deg: 0 });
  assert.equal(bearing({ x: 0, y: 0 }, { x: 300, y: 300 }).dir, "SE");
  assert.equal(bearing({ x: 0, y: 0 }, { x: -400, y: 0 }).dir, "W");
});

test("old saves get the cube fields; bad entries are dropped", () => {
  const m = cleanMap({ points: [], found: [{ x: 1, y: 2, z: 3, atMs: 4, code: 9 }, { x: "?" }], cubeCodes: [5, -1, "x"] });
  assert.deepEqual(m.found, [{ x: 1, y: 2, z: 3, code: 9, atMs: 4, byYou: false }]);
  assert.deepEqual(m.cubeCodes, [5, 1301199]);
  assert.deepEqual(cleanMap(undefined).cubeCodes, [1301199]);
});

test("climb: up, down or about level", () => {
  assert.deepEqual(climb({ z: 3750 }, { z: -70 }), { dz: -3820, way: "down" }); // the 20:18 cube, from the bank above it
  assert.equal(climb({ z: -68 }, { z: -70 }).way, "level");
  assert.equal(climb({ z: 100 }, { z: 900 }).way, "up");
});
