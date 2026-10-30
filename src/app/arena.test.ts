// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultData } from "../domain/save-file.ts";
import type { MeterUpdate } from "../domain/meter.ts";
import { takeMeterData } from "./arena.ts";

// 2026-10-26: soul points with no loot of yours (a party member's, or picked up late) placed no spot and
// were not counted, so the Pets page fell behind until the collection was read again.
test("every soul point counts for the collection, placed on the map or not", () => {
  const data = defaultData();
  const u = (extra: Partial<MeterUpdate>) => ({ profile: { name: "Randronirk" }, ...extra }) as unknown as MeterUpdate;
  takeMeterData(data, u({ pets: { atMs: 100, pets: [{ id: 1097, level: 1, points: 21 }] } }));
  takeMeterData(data, u({ souls: [], soulGains: [{ kind: 1097, points: 1, atMs: 101 }, { kind: 1097, points: 1, atMs: 102 }] }));
  assert.deepEqual(data.pets.Randronirk.pets[0], { id: 1097, level: 1, points: 23 });
  assert.equal(data.map.pets.length, 0, "no spot without a loot of yours");
  takeMeterData(data, u({ soulGains: [{ kind: 1097, points: 1, atMs: 101 }, { kind: 1097, points: 1, atMs: 102 }] }));
  assert.equal(data.pets.Randronirk.pets[0].points, 23, "the meter resends them: counted once");
});

// Gains are not tagged with a character: after a character change, the previous one's must not count for the new one.
test("soul points before a character change are not the new character's", () => {
  const data = defaultData();
  const u = (name: string, extra: Partial<MeterUpdate>) => ({ profile: { name }, ...extra }) as unknown as MeterUpdate;
  const now = Date.now();
  data.pets.Kiizu = { atMs: now - 86_400_000, pets: [{ id: 1016, level: 1, points: 3 }] }; // read yesterday
  takeMeterData(data, u("Randronirk", { soulGains: [{ kind: 1016, points: 1, atMs: now - 5_000 }] }));
  takeMeterData(data, u("Kiizu", { soulGains: [{ kind: 1016, points: 1, atMs: now - 5_000 }] }));
  assert.equal(data.pets.Kiizu.pets[0].points, 3, "Randronirk's kill is not Kiizu's");
  takeMeterData(data, u("Kiizu", { soulGains: [{ kind: 1016, points: 1, atMs: now - 5_000 }, { kind: 1016, points: 1, atMs: Date.now() + 10 }] }));
  assert.equal(data.pets.Kiizu.pets[0].points, 4, "Kiizu's own kill counts");
});
