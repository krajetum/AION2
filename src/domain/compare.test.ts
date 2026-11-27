import { test } from "node:test";
import assert from "node:assert/strict";
import { diffRows, diffText, profileRows, skillRows, slotPairs, pieceLevel, pieceText, boardRows } from "./compare.ts";
import type { Equipment, Piece, Profile } from "./armory.ts";

const prof = (cp: number, il: number, stats: [string, number][]): Profile =>
  ({ name: "x", className: "Templar", level: 45, itemLevel: il, combatPower: cp, atMs: 0, stats: stats.map(([name, value]) => ({ name, value, effects: [] })) });
const piece = (slot: number, slotName: string, name: string, enchant = 15, exceed = 0): Piece => ({ id: slot, name, grade: "Unique", icon: "", enchant, exceed, slot, slotName });
const eq = (pieces: Piece[], skills: [string, number][]): Equipment => ({ gear: pieces, accessories: [], arcana: [], pet: null, wing: null,
  active: skills.map(([name, level], i) => ({ id: i, name, icon: "", level, equipped: true })), passive: [], stigma: [] });

test("rows pair by key; a missing side counts as 0 in the difference", () => {
  const r = diffRows([{ key: "a", name: "Attack", value: 100 }, { key: "c", name: "Crit", value: 10 }], [{ key: "a", name: "Attack", value: 120 }, { key: "b", name: "Block", value: 5 }]);
  assert.deepEqual(r.map((x) => [x.name, x.a, x.b, x.diff]), [["Attack", 100, 120, -20], ["Crit", 10, null, 10], ["Block", null, 5, -5]]);
  assert.equal(diffText(r[0]), "−20");
  assert.equal(diffText(r[1]), "+10");
  assert.equal(diffText({ diff: 2.5, pct: true }), "+2.5%");
  assert.equal(diffText({ diff: 1234, pct: false }), "+1,234");
  assert.equal(diffText({ diff: 0, pct: false }), "");
});

test("profile and stats: Randronirk against a lower character", () => {
  const p = profileRows(prof(202065, 3156, []), prof(146516, 2803, []));
  assert.deepEqual(p.map((x) => [x.name, x.diff]), [["Combat power", 55549], ["Item level", 353], ["Level", 0]]);
});

test("equipment slot by slot, skills by name", () => {
  const a = eq([piece(1, "MainHand", "Enraged Kromede Sword", 15, 2), piece(3, "Helmet", "Vakron Helm")], [["Judgment", 20], ["Pummel", 19]]);
  const b = eq([piece(1, "MainHand", "Ebony Sword", 10), piece(2, "SubHand", "Guard")], [["Judgment", 15], ["Shield Rush", 3]]);
  assert.deepEqual(slotPairs(a, b).map((s) => [s.slot, s.a?.name ?? null, s.b?.name ?? null]),
    [["MainHand", "Enraged Kromede Sword", "Ebony Sword"], ["SubHand", null, "Guard"], ["Helmet", "Vakron Helm", null]]);
  assert.equal(pieceText(a.gear[0]), "+15(+2) Enraged Kromede Sword");
  assert.deepEqual(skillRows(a, b).map((x) => [x.name, x.diff]), [["Judgment", 5], ["Pummel", 19], ["Shield Rush", -3]]);
});

test("a slot empty on one side: a dash, and the Δ counts it as 0", () => {
  const a = eq([piece(1, "MainHand", "Enraged Kromede Sword", 15, 2)], []), b = eq([], []);
  const [s] = slotPairs(a, b);
  assert.equal(pieceText(s.b), "—");
  assert.equal(pieceLevel(s.a) - pieceLevel(s.b), 17);
  assert.equal(pieceLevel(s.b) - pieceLevel(s.a), -17);
});

test("Daevanion totals of both sides", () => {
  const r = boardRows([{ stats: [{ name: "Attack Bonus", value: 30, pct: false }], skills: [], open: 1, total: 1 }], [{ stats: [{ name: "Attack Bonus", value: 33, pct: false }, { name: "Combat Speed", value: 3, pct: true }], skills: [], open: 1, total: 1 }]);
  assert.deepEqual(r.map((x) => [x.name, x.diff, x.pct]), [["Attack Bonus", -3, false], ["Combat Speed", -3, true]]);
});
