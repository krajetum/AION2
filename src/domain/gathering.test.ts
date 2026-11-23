import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyGathering, gatherMarks, materials, newGathers, takeGathers, cleanGathering, type Gather } from "./gathering.ts";

// The recording of 2026-11-21: Ohkra from a node not seen (your place), then from node 33261 seen (its own place).
const g = (atMs: number, extra: Partial<Gather> = {}): Gather =>
  ({ node: null, item: 610680050, amount: 3, x: -185300, y: -56700, z: 35380, exact: false, mapId: 1110, atMs, ...extra });

test("gathers of one material at one place make one spot; the node's own place wins", () => {
  const d = emptyGathering();
  assert.equal(takeGathers(d, [g(1), g(2, { exact: true, x: -185265, y: -56783, amount: 1 })]).length, 2);
  assert.equal(d.spots.length, 1);
  assert.deepEqual({ ...d.spots[0] }, { mapId: 1110, item: 610680050, x: -185265, y: -56783, z: 35380, exact: true, count: 2, amount: 4, lastMs: 2 });
  // Calendula there too: another spot; the same gathers again: nothing new.
  takeGathers(d, [g(1), g(2), g(3, { item: 610670044, amount: 1 })]);
  assert.equal(d.spots.length, 2);
  assert.equal(d.seenMs, 3);
});

test("a gather without a map waits; far gathers are spots of their own", () => {
  const d = emptyGathering();
  assert.equal(newGathers(d, [g(1, { mapId: null })]).length, 0);
  takeGathers(d, [g(1), g(2, { x: -180000 })]);
  assert.equal(d.spots.length, 2);
});

test("marks: yours, and others' only where you have none of that material", () => {
  const d = emptyGathering();
  takeGathers(d, [g(1)]);
  d.shared = [{ mapId: 1110, item: 610680050, x: -185250, y: -56750, z: 0, n: 3 }, { mapId: 1110, item: 610680050, x: -170000, y: -50000, z: 0, n: 2 }];
  const m = gatherMarks(d);
  assert.equal(m.length, 2);
  assert.equal(m[0].players, 3);
  assert.equal(m[1].mine, null);
  assert.deepEqual(materials(m), [[610680050, 2]]);
});

test("a saved section is cleaned", () => {
  const d = cleanGathering({ spots: [{ mapId: 1, item: 2, x: 0, y: 0, z: 0, count: 1, amount: 1, lastMs: 1 }, { mapId: 0 }], seenMs: "x", shared: [{ mapId: 1, item: 2, x: 0, y: 0, z: 0, n: 0 }] });
  assert.equal(d.spots.length, 1);
  assert.equal(d.seenMs, 0);
  assert.equal(d.shared.length, 0);
});

test("spots to send: every one not sent yet (saved ones too), per map in batches, again once gathered again", async () => {
  const { toSend, SEND_BATCH } = await import("./gathering.ts");
  const d = emptyGathering();
  takeGathers(d, [g(5), g(6, { item: 610670044 }), g(7, { mapId: 20, x: 0, y: 0 })]);
  assert.deepEqual(toSend(d).map((b) => [b.mapId, b.spots.length]), [[1110, 2], [20, 1]]);
  d.sentMs = 7;
  assert.deepEqual(toSend(d), []);
  takeGathers(d, [g(9)]); // gathered there again: its spot goes again
  assert.deepEqual(toSend(d).map((b) => [b.mapId, b.spots.map((s) => s.item)]), [[1110, [610680050]]]);
  for (let i = 0; i < SEND_BATCH + 5; i++) d.spots.push({ mapId: 1, item: 1, x: i * 1000, y: 0, z: 0, exact: true, count: 1, amount: 1, lastMs: 100 + i });
  assert.deepEqual(toSend(d).filter((b) => b.mapId === 1).map((b) => b.spots.length), [SEND_BATCH, 5]);
});

test("a node is one spot of its plain material, whatever grade came out", async () => {
  const { baseMaterials, gatherMarks, materials, emptyGathering } = await import("./gathering.ts");
  const items = { "610610013": "Odyle", "610610014": "Fine Odyle", "610610015": "Pure Odyle", "610610016": "Radiant Odyle", "610660030": "Fine Ruby Gemstone", "999": "Fine Wine",
    "610670043": "Azpha", "610670047": "Fresh Azpha" };
  const base = baseMaterials(items);
  assert.equal(base.get(610610015), 610610013);
  assert.equal(base.get(610610016), 610610013);
  assert.equal(base.has(610660030), false, "no plain Ruby Gemstone listed: kept");
  assert.equal(base.has(999), false);
  assert.equal(base.get(610670047), 610670043, "plants: Fresh");
  const g = emptyGathering();
  const spot = (item: number, x: number, count: number, exact = false) => ({ mapId: 1110, item, x, y: 0, z: 0, exact, count, amount: count * 2, lastMs: x });
  g.spots = [spot(610610013, 0, 3), spot(610610015, 100, 1, true), spot(610610014, 5000, 2)];
  g.shared = [{ mapId: 1110, item: 610610016, x: 50, y: 0, z: 0, n: 4 }];
  const marks = gatherMarks(g, base);
  assert.deepEqual(marks.map((m) => [m.item, m.x, m.mine?.count, m.mine?.amount, m.players]), [[610610013, 100, 4, 8, 4], [610610013, 5000, 2, 4, 0]]);
  assert.equal(g.spots[0].count, 3, "your saved spots unchanged");
  assert.deepEqual(materials(marks), [[610610013, 2]]);
});

test("a quest item from a gather is no spot: not taken, shown or sent", async () => {
  const { gatherMarks, takeGathers, toSend, emptyGathering } = await import("./gathering.ts");
  const g = emptyGathering();
  const x = (item: number, atMs: number): Gather => ({ node: 1, item, amount: 1, x: 0, y: 0, z: 0, exact: true, mapId: 1110, atMs });
  takeGathers(g, [x(631010004, 1), x(610670043, 2)]);
  assert.deepEqual(g.spots.map((s) => s.item), [610670043]);
  g.spots.push({ ...g.spots[0], item: 631010004 }); // saved before
  g.shared = [{ mapId: 1110, item: 631010004, x: 9000, y: 0, z: 0, n: 1 }];
  assert.deepEqual(gatherMarks(g).map((m) => m.item), [610670043]);
  assert.deepEqual(toSend(g).flatMap((b) => b.spots.map((s) => s.item)), [610670043]);
});
