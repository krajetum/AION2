import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bisLines, bisSlot, checkBis, cleanBis, slotLabel, type BisTable } from "./bis.ts";

const BUNDLED: BisTable = JSON.parse(readFileSync(new URL("../assets/bis.json", import.meta.url), "utf8")).classes;

test("bundled BiS: 8 classes, 18 slots each, 6 lines on armour and jewellery", () => {
  assert.deepEqual(Object.keys(BUNDLED).sort(), ["Assassin", "Chanter", "Cleric", "Gladiator", "Ranger", "Sorcerer", "Spiritmaster", "Templar"]);
  for (const slots of Object.values(BUNDLED)) {
    assert.equal(Object.keys(slots).length, 18);
    for (const s of ["Weapon", "Off-hand", "Torso", "Pants", "Helmet", "Shoulders", "Gloves", "Boots", "Cape", "Necklace", "Earring", "Ring"]) assert.equal(slots[s].length, 6, s);
    assert.equal(slots.Bracelet.length, 5);
  }
  assert.deepEqual(BUNDLED.Chanter.Weapon[0], { stat: "Combat Speed", value: "13.0%", pct: 100 });
});

test("slots and arcana kinds", () => {
  assert.equal(bisSlot("MainHand"), "Weapon");
  assert.equal(bisSlot("Earring2"), "Earring");
  assert.equal(bisSlot("Belt"), null);
  assert.equal(slotLabel("Arcana3"), "Compass arcana");
});

test("what a piece has of its ideal lines: the Chanter's rod has 3 of 6, an arcana its skills", () => {
  const rod = { name: "Enraged Kromede Rod", grade: "Unique", category: "", level: 86, maxEnchant: 15, main: [], manastones: [], godstones: [], skills: [], set: null,
    sub: [{ name: "Combat Speed", value: "12.3%" }, { name: "Might", value: "29" }, { name: "Weapon Damage Boost", value: "8.9%" }] };
  const c = checkBis(BUNDLED.Chanter.Weapon, rod);
  assert.equal(c.has, 3);
  assert.equal(c.lines.find((l) => l.line.stat === "Might")?.yours, "29");
  const parchment = { ...rod, sub: [], skills: [{ name: "Dark Crush", level: 3 }, { name: "Spinning Strike", level: 1 }] };
  const a = checkBis(BUNDLED.Chanter.Arcana2, parchment);
  assert.deepEqual(a.lines.map((l) => l.yours), ["+3", null, "+1", null]);
  assert.equal(checkBis(BUNDLED.Chanter.Weapon, null).has, 0);
});

test("the player's own list replaces the bundled one, and is cleaned on load", () => {
  const mine = cleanBis({ Chanter: { Weapon: [{ stat: " Might ", value: "32" }, { stat: "", value: "x" }, null] }, bad: 3 });
  assert.deepEqual(mine, { Chanter: { Weapon: [{ stat: "Might", value: "32" }] } });
  assert.deepEqual(bisLines(BUNDLED, mine, "Chanter", "Weapon"), [{ stat: "Might", value: "32" }]);
  assert.equal(bisLines(BUNDLED, mine, "Chanter", "Torso")?.length, 6);
  assert.equal(bisLines(BUNDLED, mine, "Painter", "Torso"), null);
});
