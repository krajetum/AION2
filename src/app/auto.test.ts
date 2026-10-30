// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultData } from "../domain/save-file.ts";
import type { MeterEvent } from "../domain/triggers.ts";
import type { Task } from "../domain/types.ts";
import { popUndo } from "../domain/undo.ts";
import { autoTick } from "./auto.ts";

function setup(extra: Partial<Task> = {}) {
  const data = defaultData();
  const t: Task = { id: "dng", cadence: "weekly", category: "Dungeons", name: "Fire Temple", enabled: true, order: 0, triggers: [{ kind: "map", mapId: 3104 }], ...extra };
  data.tasks = [t];
  return { data, charId: data.characters[0].id };
}
const enter = (atMs: number): MeterEvent => ({ trigger: { kind: "map", mapId: 3104 }, atMs });

test("a matching event ticks the task, once while it is done", () => {
  const { data, charId } = setup();
  assert.deepEqual(autoTick(data, charId, enter(0), new Map()).map((t) => t.id), ["dng"]);
  assert.equal(data.progress[charId].dng.done, true);
  assert.equal(autoTick(data, charId, enter(REENTRY), new Map()).length, 0);
});

const REENTRY = 11 * 60_000;

test("a goal task gets +1 on its first unreached goal; a re-entry soon after does not count", () => {
  const { data, charId } = setup({ goals: [{ label: "Runs", target: 2 }, { label: "Bonus", target: 1 }] });
  const entered = new Map<string, number>();
  autoTick(data, charId, enter(0), entered);
  autoTick(data, charId, enter(60_000), entered); // died, came back in
  assert.deepEqual(data.progress[charId].dng.counts, [1]);
  autoTick(data, charId, enter(REENTRY), entered);
  autoTick(data, charId, enter(2 * REENTRY), entered);
  assert.deepEqual(data.progress[charId].dng.counts, [2, 1]);
  assert.equal(data.progress[charId].dng.done, true);
});

test("an auto tick is one undo step", () => {
  const { data, charId } = setup();
  autoTick(data, charId, enter(0), new Map());
  assert.equal(popUndo(data, charId), "Fire Temple");
  assert.equal(data.progress[charId].dng, undefined);
});
