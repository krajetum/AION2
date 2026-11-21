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
  assert.equal(d.version, 3);
  const sanctuary = d.tasks.find((t) => t.name === "Sanctuary")!;
  assert.ok(sanctuary.enabled && sanctuary.note?.includes("Ludra"));
  const outer = d.tasks.find((t) => t.name === "Chaotic Outer Reshanta")!;
  assert.equal(outer.id, "weekly-outer-reshanta");
  assert.ok(outer.order > 9 && outer.order < 10);
  // Deleted afterwards: not added again.
  const again = normalize({ ...d, tasks: d.tasks.filter((t) => t.id !== outer.id) });
  assert.ok(!again.tasks.some((t) => t.name === "Chaotic Outer Reshanta"));
});

test("save file: a v2 save gets the 2026-11-18 notes, an edited note stays", () => {
  const old: Task[] = [
    { id: "daily-2", cadence: "daily", category: "Content", name: "Pet/Kina Farm", enabled: true, order: 2, note: "Daily cap 1M Kina" },
    { id: "weekly-9", cadence: "weekly", category: "Content", name: "Sanctuary", enabled: true, order: 9,
      note: "Abyssal Forge: Ludra · Normal 2,800 / Hard 3,000 item level · 1 h" },
    { id: "weekly-1", cadence: "weekly", category: "Content", name: "Daily Dungeon", enabled: true, order: 1, note: "Daily cap 1M Kina" },
  ];
  const d = normalize({ version: 2, tasks: old, characters: [{ id: "c", name: "Main" }] });
  assert.ok(d.tasks.find((t) => t.name === "Pet/Kina Farm")!.note!.includes("Bound Kina"));
  assert.ok(d.tasks.find((t) => t.name === "Sanctuary")!.note!.includes("Easy"));
  assert.equal(d.tasks.find((t) => t.name === "Daily Dungeon")!.note, "Daily cap 1M Kina");
  assert.ok(!d.tasks.some((t) => t.name === "Chaotic Outer Reshanta"));
});

test("save file: a Sanctuary task the player changed is left alone", () => {
  const t: Task = { id: "weekly-9", cadence: "weekly", category: "Content", name: "Sanctuary", enabled: false, order: 9, note: "Skip" };
  const d = normalize({ tasks: [t], characters: [{ id: "c", name: "Main" }] });
  assert.deepEqual(d.tasks.find((x) => x.name === "Sanctuary"), t);
});

test("save file: the sound theme is kept when known, else default", () => {
  const theme = (soundTheme?: unknown) => normalize({ tasks: [], characters: [{ id: "c", name: "Main" }], settings: { soundTheme } }).settings.soundTheme;
  assert.equal(theme("scream"), "scream");
  assert.equal(theme("premium"), "premium");
  assert.equal(theme("nope"), "default");
  assert.equal(theme(), "default");
});

test("save file: custom sounds keep each channel's known theme", () => {
  const s = normalize({ tasks: [], characters: [{ id: "c", name: "Main" }], settings: { soundTheme: "custom", channelThemes: { cube: "pingy", shugo: "nope", news: 3 } } }).settings;
  assert.equal(s.soundTheme, "custom");
  assert.deepEqual(s.channelThemes, { cube: "pingy" });
  assert.deepEqual(normalize({ tasks: [], characters: [{ id: "c", name: "Main" }] }).settings.channelThemes, {});
});
