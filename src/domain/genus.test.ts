import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanGenus, genusTotal, linesIn, shownPreset, statName, statText, takeGenus, type GenusRead } from "./genus.ts";

// The player's Cogni and Special insights, preset 1, as the meter read them at login on 2026-11-21.
const read = (): GenusRead => ({
  atMs: 1000, preset: null,
  insights: [
    { id: 2, level: 10, presets: [[
      { slot: 0, grade: 5, stat: 19, value: 9 }, { slot: 1, grade: 4, stat: 41, value: 156 }, { slot: 2, grade: 4, stat: 104, value: 15 },
      { slot: 3, grade: 4, stat: 379, value: 237 }, { slot: 7, grade: 4, stat: 196, value: 82 }], [], []] },
    { id: 6, level: 10, presets: [[{ slot: 0, grade: 3, stat: 31, value: 11 }, { slot: 2, grade: 5, stat: 104, value: 28 }], [], []] },
  ],
});

test("stats are named as the insight pages show them", () => {
  assert.equal(statName(41), "Critical Damage Defense");
  assert.equal(statName(405), "Fera Critical Hit");
  assert.equal(statName(420), "Varian Evasion");
  assert.equal(statName(422), "Varian Critical Hit Resist");
  assert.equal(statName(399), "Stat #399"); // a race block's 7th: not seen yet
  assert.equal(statName(9999), "Stat #9999");
});

test("percent values round as the game rounds them", () => {
  assert.equal(statText(379, 237), "2.4%");
  assert.equal(statText(196, 105), "1%");
  assert.equal(statText(447, 145), "1.4%");
  assert.equal(statText(196, 82), "0.8%");
  assert.equal(statText(32, 258), "2.6%");
  assert.equal(statText(41, 156), "156");
});

test("the total adds every insight's lines of the preset by stat", () => {
  const g = read();
  assert.deepEqual(genusTotal(g, 1).find((r) => r.stat === 104), { stat: 104, value: 43 });
  assert.equal(genusTotal(g, 2).length, 0);
  assert.deepEqual(linesIn(g, 1).map((i) => i.name), ["Cogni Insight", "Special Insight"]);
});

test("the preset shown: the one switched to, else the first with lines", () => {
  const g = read();
  assert.equal(shownPreset(g), 1);
  assert.equal(shownPreset({ ...g, preset: 3 }), 3);
  g.insights[0].presets = [[], g.insights[0].presets[0], []];
  g.insights[1].presets = [[], [], []];
  assert.equal(shownPreset(g), 2);
});

test("a read is kept per character, newer or switched only", () => {
  const all: Record<string, GenusRead> = {};
  assert.equal(takeGenus(all, "Randronirk", read()), true);
  assert.equal(takeGenus(all, "Randronirk", read()), false);
  assert.equal(takeGenus(all, "Randronirk", { ...read(), preset: 2 }), true);
  assert.equal(all.Randronirk.preset, 2);
  assert.equal(takeGenus(all, "Randronirk", { ...read(), atMs: 500 }), false);
  assert.equal(takeGenus(all, "", read()), false);
  assert.equal(takeGenus(all, "X", { insights: "no" }), false);
});

test("junk lines are dropped when cleaning", () => {
  const g = cleanGenus({ atMs: 1, preset: 9, insights: [{ id: 2, level: 10, presets: [[{ slot: 0, grade: 4, stat: 0, value: 3 }, { slot: 1, grade: 4, stat: 19, value: -1 }, { slot: 2, grade: 4, stat: 19, value: 5 }]] }] });
  assert.deepEqual(g?.insights[0].presets[0], [{ slot: 2, grade: 4, stat: 19, value: 5 }]);
  assert.equal(g?.preset, null);
});
