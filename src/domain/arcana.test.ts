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

test("golden arcana: farmed, no transmute; levels that went to the wrong skills", () => {
  const parch = arcanaPlan("Arcana2", [{ name: "Vicious Strike", level: 2 }, { name: "Judgment", level: 4 }, { name: "Punishment", level: 2 }, { name: "Annihilate", level: 1 }],
    [{ stat: "Vicious Strike", value: "+4" }, { stat: "Judgment", value: "+3" }, { stat: "Punishment", value: "+1" }, { stat: "Annihilate", value: "+1" }])!;
  assert.equal(parch.craft, false);
  assert.equal(parch.options.length, 0);
  assert.deepEqual(parch.wrong, [{ name: "Judgment", level: 4, wanted: 3 }, { name: "Punishment", level: 2, wanted: 1 }]);
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
