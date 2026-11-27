import { test } from "node:test";
import assert from "node:assert/strict";
import { arcanaPlan, levelChance } from "./arcana.ts";

const TEMPLAR_CHALICE = [{ stat: "Fury", value: "+4" }, { stat: "Impact Hit", value: "+3" }, { stat: "Vicious Strike", value: "+1" }, { stat: "Judgment", value: "+1" }];
const h = (...names: string[]) => names.map((name) => ({ name }));
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("chalice: 2 picked, the other 2 from 20; better than 2 of 4 only when one more lands", () => {
  const p = arcanaPlan("Arcana1", h("Fury", "Impact Hit", "Pummel", "Defiance"), TEMPLAR_CHALICE)!;
  assert.deepEqual(p.have, ["Fury", "Impact Hit"]);
  const two = p.options.find((o) => o.fixed.length === 2)!;
  assert.deepEqual(two.fixed, ["Fury", "Impact Hit"]);
  near(two.perfect, 1 / 190);
  near(two.better, 37 / 190);
  near(two.expected, 2 + 2 * 2 / 20);
  assert.equal(p.options.length, 1); // crafted with 2 picked only
  assert.equal(two.crystals, 15);
});

test("golden arcana: farmed, no transmute", () => {
  const parch = arcanaPlan("Arcana2", h("Vicious Strike", "Poach"), [{ stat: "Vicious Strike" }, { stat: "Judgment" }, { stat: "Punishment" }, { stat: "Annihilate" }])!;
  assert.equal(parch.craft, false);
  assert.equal(parch.options.length, 0);
  assert.deepEqual(parch.missing, ["Judgment", "Punishment", "Annihilate"]);
});

test("actives at 20 elsewhere aren't wanted here; levels past 20 or on skills not wanted are wasted", () => {
  // Randronirk 2026-11-27: Judgment 21 = 14 + Chalice 2 + Parchment 4 + ring 1.
  const totals = { Judgment: { level: 21, passive: false }, "Vicious Strike": { level: 15, passive: false }, Fury: { level: 18, passive: true }, "Impact Hit": { level: 17, passive: true } };
  const chalice = arcanaPlan("Arcana1", [{ name: "Judgment", level: 2 }, { name: "Punishment", level: 2 }, { name: "Pummel", level: 2 }, { name: "Poach", level: 3 }], TEMPLAR_CHALICE, totals)!;
  assert.deepEqual(chalice.covered, []); // 21 - 2 = 19: still needed here
  assert.deepEqual(chalice.wasted.map((w) => [w.name, w.levels, w.why]), [["Judgment", 1, "over"], ["Punishment", 1, "other"], ["Pummel", 1, "other"], ["Poach", 2, "other"]]);
  const parch = arcanaPlan("Arcana2", [{ name: "Judgment", level: 4 }], [{ stat: "Judgment" }, { stat: "Vicious Strike" }], { Judgment: { level: 24, passive: false } })!;
  assert.deepEqual(parch.covered, ["Judgment"]);
  assert.deepEqual(parch.missing, ["Vicious Strike"]);
  assert.deepEqual(parch.wasted, [{ name: "Judgment", levels: 4, why: "over" }]);
});

test("an arcana with every ideal skill has nothing to transmute; a shorter list is all of it", () => {
  assert.equal(arcanaPlan("Arcana1", h("Fury", "Impact Hit", "Vicious Strike", "Judgment"), TEMPLAR_CHALICE)!.options.length, 0);
  const short = arcanaPlan("Arcana1", [], [{ stat: "A" }, { stat: "B" }])!;
  near(short.options[0].perfect, 1);
});

test("5 random levels landing +4/+3/+1/+1", () => {
  near(levelChance([4, 3, 1, 1])!, 10 / 1024);
  assert.equal(levelChance([4, 3, 1]), null);
  assert.equal(levelChance([2, 2, 2, 2]), null);
});
