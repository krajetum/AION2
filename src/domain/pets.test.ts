// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { addSoulPoints, cleanCollections, finishFromSilentKills, needed, petName, takeCollection, wanted, type PetCollection } from "./pets.ts";

// From the collection read on 2026-10-26 12:05: Unstable Spider 1117 (2, 55/75), Armadon 1046 (2, 39/75), 1005 at level 3.
const read = (): PetCollection => ({ atMs: 100, pets: [{ id: 1117, level: 2, points: 55 }, { id: 1046, level: 2, points: 39 }, { id: 1005, level: 3, points: 0 }] });

test("soul points after the read add up, level up at the threshold, unlock new pets at 5", () => {
  const c = read();
  const g = (kind: number, atMs: number, points = 1) => ({ kind, points, atMs });
  assert.equal(addSoulPoints(c, [g(1117, 50), g(1046, 100)]), false, "gained before or at the read: already in it");
  addSoulPoints(c, [g(1117, 101, 19), g(1117, 102, 3)]);
  assert.deepEqual(c.pets[0], { id: 1117, level: 3, points: 0 }, "55 + 22 = 77: level 3, the last");
  addSoulPoints(c, [g(1005, 103)]);
  assert.deepEqual(c.pets[2], { id: 1005, level: 3, points: 0 }, "a maxed pet stays");
  addSoulPoints(c, [g(1300, 104, 4)]);
  assert.deepEqual(c.pets[3], { id: 1300, level: 0, points: 4 });
  assert.equal(needed(c.pets[3]), 5, "4/5 to unlock");
  addSoulPoints(c, [g(1300, 105, 2)]);
  assert.deepEqual(c.pets[3], { id: 1300, level: 1, points: 1 }, "unlocked at 5, the extra point carries on");
  assert.equal(c.atMs, 105);
});

test("a newer read replaces the kept one, an older does not; per character", () => {
  const all: Record<string, PetCollection> = {};
  assert.equal(takeCollection(all, "Randronirk", read()), true);
  assert.equal(takeCollection(all, "Randronirk", { ...read(), atMs: 50 }), false);
  assert.equal(takeCollection(all, "", read()), false, "no character: not kept");
  assert.deepEqual(Object.keys(cleanCollections({ ...all, Bad: { pets: "x" }, "": read() })), ["Randronirk"]);
});

test("names and what is still wanted", () => {
  assert.equal(petName(1097, {}, { "1097": "Highland Karnif" }), "Karnif", "the database's name before the mob's");
  assert.equal(petName(1117, {}, {}), "Unstable Spider"); // 55/75 in the player's collection
  assert.equal(petName(1046, {}, {}), "Armadon"); // 39/75
  assert.equal(petName(9999, {}, { "9999": "Some Mob" }), "Some Mob", "not in the database: the mob's");
  assert.equal(petName(1097, { "1097": "Karnif" }, { "1097": "Highland Karnif" }), "Karnif");
  assert.equal(petName(9998, {}, {}), "Pet #9998");
  assert.equal(wanted(read(), 1117), true);
  assert.equal(wanted(read(), 1005), false, "level 3");
  assert.equal(wanted(read(), 1400), true, "not owned");
  assert.equal(wanted(undefined, 1005), true, "no collection read: everything");
});


test("a pet a few points short whose mob's kills give no more points is done (Forest Guardian 74/75, 2026-10-27)", () => {
  const all: Record<string, PetCollection> = {};
  takeCollection(all, "Me", { atMs: 100, pets: [{ id: 1101, level: 2, points: 74 }, { id: 1207, level: 2, points: 40 }] });
  const c = all.Me;
  const pet = (mob: string) => (({ "Forest Guardian": 1101, "Old Agrint": 1207 }) as Record<string, number>)[mob] ?? null;
  const loot = (entity: number, mob: string, atMs: number) => ({ entity, mob, atMs });
  assert.equal(finishFromSilentKills(c, [loot(1, "Forest Guardian", 1_000)], [], pet), false, "one silent kill: maybe its points were lost");
  assert.equal(finishFromSilentKills(c, [loot(1, "Forest Guardian", 1_000), loot(2, "Forest Guardian", 5_000)], [{ kind: 1101, points: 1, atMs: 5_400 }], pet), false,
    "the second gave points: not done");
  assert.equal(finishFromSilentKills(c, [loot(1, "Old Agrint", 1_000), loot(2, "Old Agrint", 5_000)], [], pet), false, "40/75 is not nearly done");
  assert.equal(finishFromSilentKills(c, [loot(1, "Forest Guardian", 50), loot(2, "Forest Guardian", 60)], [], pet), false, "before the read");
  assert.equal(finishFromSilentKills(c, [loot(1, "Forest Guardian", 1_000), loot(1, "Forest Guardian", 1_001), loot(3, "Forest Guardian", 9_000)], [], pet), true);
  assert.deepEqual(c.pets[0], { id: 1101, level: 3, points: 0 });
});
