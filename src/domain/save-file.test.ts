// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize } from "./save-file.ts";
import type { Task } from "./types.ts";

test("save file: a save from before 2026-11-04 gets the Sanctuary on and Chaotic Outer Reshanta, once", () => {
  const old: Task[] = [
    { id: "weekly-8", cadence: "weekly", category: "Content", name: "Abyss Siege + Corridors", enabled: true, order: 8 },
    { id: "weekly-9", cadence: "weekly", category: "Content", name: "Sanctuary", enabled: false, order: 9, note: "Not in the game yet" },
    { id: "weekly-10", cadence: "weekly", category: "Season Quests", name: "Battlefield", enabled: true, order: 10 },
  ];
  const d = normalize({ version: 1, tasks: old, characters: [{ id: "c", name: "Main" }] });
  assert.equal(d.version, 2);
  const sanctuary = d.tasks.find((t) => t.name === "Sanctuary")!;
  assert.ok(sanctuary.enabled && sanctuary.note?.includes("Ludra"));
  const outer = d.tasks.find((t) => t.name === "Chaotic Outer Reshanta")!;
  assert.equal(outer.id, "weekly-outer-reshanta");
  assert.ok(outer.order > 9 && outer.order < 10);
  // Deleted afterwards: not added again.
  const again = normalize({ ...d, tasks: d.tasks.filter((t) => t.id !== outer.id) });
  assert.ok(!again.tasks.some((t) => t.name === "Chaotic Outer Reshanta"));
});

test("save file: a Sanctuary task the player changed is left alone", () => {
  const t: Task = { id: "weekly-9", cadence: "weekly", category: "Content", name: "Sanctuary", enabled: false, order: 9, note: "Skip" };
  const d = normalize({ tasks: [t], characters: [{ id: "c", name: "Main" }] });
  assert.deepEqual(d.tasks.find((x) => x.name === "Sanctuary"), t);
});
