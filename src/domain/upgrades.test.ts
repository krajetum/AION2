import { test } from "node:test";
import assert from "node:assert/strict";
import type { Equipment, ItemDetail, Piece } from "./armory.ts";
import { buildUpgrades, type Tables } from "./upgrades.ts";

// Tables as literals (node --test takes no Vite JSON imports): a Gladiator's weapon, ring and Chalice.
const T: Tables = {
  bis: { Gladiator: {
    Weapon: [{ stat: "Combat Speed", value: "13%", pct: 100 }, { stat: "Might", value: "32", pct: 100 }, { stat: "Damage Boost", value: "7%", pct: 99 }],
    Ring: [{ stat: "Might", value: "14", pct: 100 }, { stat: "Attack", value: "29", pct: 99 }, { stat: "Overhead Slam", value: "+1", pct: 75 }],
    Arcana1: [{ stat: "Overhead Slam", value: "+4" }, { stat: "Attack Preparation", value: "+3" }, { stat: "Experienced Counterstrike", value: "+1" }, { stat: "Impact Hit", value: "+1" }],
  } },
  mine: {},
  carry: { Gladiator: { Weapon: { "Combat Speed": 100, Might: 100, "Damage Boost": 99 }, Ring: { Might: 100, Attack: 99, Precision: 94 } } },
  ranks: { tiers: { S: 100, A: 80, B: 60, C: 20 }, slots: { Weapon: [["Combat Speed", "S"], ["Damage Boost", "S"], ["Might", "A"]] } },
};

const piece = (slot: number, slotName: string, grade = "Unique"): Piece => ({ id: slot, name: `P${slot}`, grade, icon: "", enchant: 0, exceed: 0, slot, slotName });
const detail = (sub: string[], skills: [string, number][] = [], random = true, added?: string): ItemDetail => ({
  name: "x", grade: "Unique", category: "", level: 102, maxEnchant: 15, main: [], manastones: [], godstones: [], set: null, random,
  sub: sub.map((name) => ({ id: name, name, value: "1", added: name === added })), skills: skills.map(([name, level]) => ({ name, level })),
});
const eqOf = (gear: Piece[], accessories: Piece[], arcana: Piece[]): Equipment => ({
  gear, accessories, arcana, pet: null, wing: null, stigma: [],
  active: [{ id: 1, name: "Overhead Slam", icon: "", level: 18, equipped: false }, { id: 2, name: "Attack Preparation", icon: "", level: 21, equipped: false }],
  passive: [{ id: 3, name: "Impact Hit", icon: "", level: 6, equipped: false }],
});

test("buildUpgrades matches the old Equipment logic", () => {
  const weapon = piece(1, "MainHand"), belt = piece(10, "Belt"), ring = piece(14, "Ring1"), chalice = piece(41, "Arcana1"), parch = piece(42, "Arcana2", "Legend");
  const eq = eqOf([weapon, belt], [ring], [chalice, parch]);
  const details = {
    1: detail(["Combat Speed", "Might", "Block", "HP"]),
    10: detail(["Attack"], [], false),
    14: detail(["Might", "Attack", "Precision"], [["Overhead Slam", 1]], true, "Precision"),
    41: detail([], [["Overhead Slam", 4], ["Attack Preparation", 2], ["Keen Strike", 2], ["Leaping Slam", 1]]),
    42: detail([], [["Overhead Slam", 2]]),
  };
  const up = buildUpgrades(eq, details, "Gladiator", T);
  assert.deepEqual(up.plans.map((x) => x.p.slot).sort(), [1, 14]); // the belt can't be rerolled
  assert.deepEqual(up.todo.map((x) => x.p.slot), [1]);
  assert.deepEqual(up.done.map((x) => x.p.slot), [14]);
  const w = up.todo[0];
  assert.deepEqual(w.plan.steps.map((s) => s.line), ["Block"]); // one wanted line missing (Damage Boost): the least likely junk line goes
  assert.deepEqual(w.plan.missing, ["Damage Boost"]);
  assert.ok(w.ranked && w.ranked["Combat Speed"].rank === "S"); // the static's ranks where the slot has them
  assert.equal(up.done[0].ranked, null); // rings: carry shares
  assert.deepEqual(w.lines, ["Combat Speed", "Might", "Block", "HP"]);
  assert.equal(up.arcana.length, 1);
  assert.equal(up.arcana[0].slot, "Arcana1");
  assert.deepEqual(up.arcana[0].plan.missing, ["Experienced Counterstrike", "Impact Hit"]);
  assert.deepEqual(up.notUnique, ["P42"]);
  assert.deepEqual(up.totals["Overhead Slam"], { level: 18, passive: false });
  assert.deepEqual(up.totals["Impact Hit"], { level: 6, passive: true });
});

test("everything ideal: todo empty, done full", () => {
  const ring = piece(14, "Ring1");
  const up = buildUpgrades(eqOf([], [ring], []), { 14: detail(["Might", "Attack", "Precision"], [["Overhead Slam", 1]], true, "Might") }, "Gladiator", T);
  assert.equal(up.todo.length, 0);
  assert.equal(up.done.length, 1);
  assert.deepEqual(buildUpgrades(null, {}, "Gladiator", T), { plans: [], todo: [], done: [], arcana: [], notUnique: [], totals: {} });
});
