import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultData } from "./save-file.ts";
import { allDone } from "./tasks.ts";

test("a cadence is all done when every enabled task is, and never when it has none", () => {
  const d = defaultData(), c = d.characters[0].id;
  d.tasks = [
    { id: "a", cadence: "daily", category: "x", name: "A", enabled: true, order: 0 },
    { id: "b", cadence: "daily", category: "x", name: "B", enabled: true, order: 1, goals: [{ target: 2 }] },
    { id: "off", cadence: "daily", category: "x", name: "Off", enabled: false, order: 2 },
  ];
  assert.equal(allDone(d, c, "weekly"), false);
  assert.equal(allDone(d, c, "daily"), false);
  d.progress[c] = { a: { done: true }, b: { done: false, counts: [1] } };
  assert.equal(allDone(d, c, "daily"), false);
  d.progress[c].b.counts = [2];
  assert.equal(allDone(d, c, "daily"), true);
});
