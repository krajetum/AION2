import { test } from "node:test";
import assert from "node:assert/strict";
import { arcanaPlan, levelChance } from "./arcana.ts";

const TEMPLAR_CHALICE = [{ stat: "Fury", value: "+4" }, { stat: "Impact Hit", value: "+3" }, { stat: "Vicious Strike", value: "+1" }, { stat: "Judgment", value: "+1" }];
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("chalice: 2 picked, the other 2 from 20; better than 2 of 4 only when one more lands", () => {
  const p = arcanaPlan("Arcana1", ["Fury", "Impact Hit", "Pummel", "Defiance"], TEMPLAR_CHALICE)!;
  assert.deepEqual(p.have, ["Fury", "Impact Hit"]);
  const two = p.options.find((o) => o.fixed.length === 2)!;
  assert.deepEqual(two.fixed, ["Fury", "Impact Hit"]);
  near(two.perfect, 1 / 190);
  near(two.better, 37 / 190);
  near(two.expected, 2 + 2 * 2 / 20);
  const one = p.options.find((o) => o.fixed.length === 1)!;
  near(one.perfect, 1 / 1330); // 3 of 21
  assert.equal(one.crystals, 5);
});

test("golden arcana: small pools", () => {
  const parch = arcanaPlan("Arcana2", [], [{ stat: "Vicious Strike" }, { stat: "Judgment" }, { stat: "Punishment" }, { stat: "Annihilate" }])!;
  near(parch.options.find((o) => o.fixed.length === 2)!.perfect, 1 / 6);
  const bell = arcanaPlan("Arcana4", [], [{ stat: "Fury" }, { stat: "Insulting Roar" }, { stat: "Punishing Benediction" }, { stat: "Enhance Health" }])!;
  near(bell.options.find((o) => o.fixed.length === 2)!.perfect, 1 / 3);
});

test("an arcana with every ideal skill has nothing to transmute; a shorter list is all of it", () => {
  assert.equal(arcanaPlan("Arcana1", ["Fury", "Impact Hit", "Vicious Strike", "Judgment"], TEMPLAR_CHALICE)!.options.length, 0);
  const short = arcanaPlan("Arcana3", [], [{ stat: "A" }, { stat: "B" }])!;
  near(short.options.find((o) => o.fixed.length === 2)!.perfect, 1);
});

test("5 random levels landing +4/+3/+1/+1", () => {
  near(levelChance([4, 3, 1, 1])!, 10 / 1024);
  assert.equal(levelChance([4, 3, 1]), null);
  assert.equal(levelChance([2, 2, 2, 2]), null);
});
