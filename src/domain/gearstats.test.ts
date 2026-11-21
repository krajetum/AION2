import { test } from "node:test";
import assert from "node:assert/strict";
import { parseItem, type Piece } from "./armory.ts";
import { gearStats, gearText } from "./gearstats.ts";

// The player's sword and Kromede ring as the official site sent them on 2026-11-21 (icons left out).
const [SWORD, RING] = [{"name": "Enraged Kromede Sword", "grade": "Unique", "categoryName": "Longsword(Extend)", "level": 86, "mainStats": [{"id": "WeaponFixingDamage", "name": "Attack", "minValue": "354", "value": "442", "extra": "146", "exceed": false}, {"id": "WeaponAccuracy", "name": "Accuracy", "value": "150", "extra": "0", "exceed": false}, {"id": "Critical", "name": "Critical Hit", "value": "50", "extra": "0", "exceed": false}, {"id": "Block", "name": "Block", "value": "200", "extra": "0", "exceed": false}, {"id": "WeaponFixingDamage", "name": "Attack", "value": "0", "extra": "24", "exceed": true}, {"id": "AmplifyAllDamage", "name": "Damage Boost", "value": "0%", "extra": "2%", "exceed": true}], "subStats": [{"id": "CombatSpeed", "name": "Combat Speed", "value": "12.3%", "added": false}, {"id": "STR", "name": "Might", "value": "31", "added": false}, {"id": "WeaponFixingDamage", "name": "Attack", "value": "48", "added": false}], "magicStoneStat": [{"id": "Accuracy", "value": "+7", "name": "Accuracy Bonus", "grade": "Rare", "slotPos": 0}, {"id": "Critical", "value": "+7", "name": "Critical Hit", "grade": "Rare", "slotPos": 1}, {"id": "Critical", "value": "+15", "name": "Critical Hit", "grade": "Unique", "slotPos": 2}, {"id": "CriticalResist", "value": "+10", "name": "Critical Hit Resist", "grade": "Legend", "slotPos": 3}]}, {"name": "Enraged Kromede Ring", "grade": "Unique", "categoryName": "Ring", "level": 86, "mainStats": [{"id": "WeaponFixingDamage", "name": "Attack", "value": "88", "extra": "72", "exceed": false}, {"id": "ArmorDefense", "name": "Defense", "value": "212", "extra": "184", "exceed": false}, {"id": "WeaponFixingDamage", "name": "Attack", "value": "0", "extra": "12", "exceed": true}, {"id": "ArmorDefense", "name": "Defense", "value": "0", "extra": "24", "exceed": true}, {"id": "AmplifyAllDamage", "name": "Damage Boost", "value": "0%", "extra": "1%", "exceed": true}], "subStats": [{"id": "CriticalResist", "name": "Critical Hit Resist", "value": "45", "added": false}, {"id": "WeaponFixingDamage", "name": "Attack", "value": "22", "added": false}], "magicStoneStat": [{"id": "Critical", "value": "+7", "name": "Critical Hit", "grade": "Rare", "slotPos": 0}, {"id": "Block", "value": "+7", "name": "Block", "grade": "Common", "slotPos": 1}, {"id": "MPMax", "value": "+30", "name": "MP", "grade": "Rare", "slotPos": 2}, {"id": "Accuracy", "value": "+7", "name": "Accuracy Bonus", "grade": "Rare", "slotPos": 3}]}];
const piece = (slot: number, name: string): Piece => ({ id: slot, name, grade: "Unique", icon: "", enchant: 15, exceed: 2, slot, slotName: "" });

test("the pieces' lines add up by stat, enchant and manastones included", () => {
  const stats = gearStats([{ piece: piece(1, "Enraged Kromede Sword"), detail: parseItem(SWORD) }, { piece: piece(13, "Enraged Kromede Ring"), detail: parseItem(RING) }]);
  const get = (k: string) => stats.find((s) => s.key === k);
  // Sword: 442 + 146 enchant + 24 past the cap + a 48 bonus line; ring: 88 + 72 + 12 + 22.
  assert.equal(get("WeaponFixingDamage")?.value, 660 + 194);
  assert.deepEqual(get("WeaponFixingDamage")?.by, [{ slot: 1, piece: "Enraged Kromede Sword", value: 660 }, { slot: 13, piece: "Enraged Kromede Ring", value: 194 }]);
  // A weapon's Accuracy and a manastone's "Accuracy Bonus" are one stat, as in Stat Info; the ring's manastone too.
  assert.equal(get("Accuracy")?.name, "Accuracy");
  assert.equal(get("Accuracy")?.value, 150 + 7 + 7);
  assert.equal(get("Critical")?.value, 50 + 7 + 15 + 7);
  assert.equal(get("CombatSpeed%")?.value, 12.3);
  assert.equal(get("STR")?.name, "Might");
  assert.equal(stats[0].key, "WeaponFixingDamage"); // Stat Info's order first
  assert.equal(gearText(get("WeaponFixingDamage")!), "854");
  assert.equal(gearText(get("AmplifyAllDamage%")!), "3%");
});

test("pieces not read yet are left out", () => {
  assert.deepEqual(gearStats([{ piece: piece(1, "Sword"), detail: undefined }, { piece: piece(2, "Shield"), detail: null }]), []);
});
