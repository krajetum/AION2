// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { DUNGEONS, doubt, itemLevelRange, seasonMissions, val } from "./wiki.ts";

test("wiki: unique ids, every dungeon has modes, a final boss and sources", () => {
  assert.equal(new Set(DUNGEONS.map((d) => d.id)).size, DUNGEONS.length);
  for (const d of DUNGEONS) {
    assert.ok(d.modes.length && d.sources.length, d.id);
    assert.ok(d.bosses.some((b) => b.role === "final"), d.id);
  }
});

test("wiki: season missions found by dungeon name (fails if season.ts names drift)", () => {
  assert.deepEqual(seasonMissions("Deus Research Base").filter((m) => !m.weekly).map((m) => m.name),
    [1, 2, 3, 4].map((n) => `Deus Research Base Stage ${n}`));
});

test("wiki: values and item level range", () => {
  assert.equal(val("700"), "700");
  assert.equal(doubt({ v: "x", note: "why" }), "why");
  assert.equal(doubt("700"), "");
  assert.equal(itemLevelRange(DUNGEONS.find((d) => d.id === "krao")!), "200–2,600");
  assert.equal(itemLevelRange(DUNGEONS.find((d) => d.id === "horn")!), "2,100");
});
