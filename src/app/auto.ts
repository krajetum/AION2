// Auto-tracked tasks: an event the meter saw ticks the tasks whose triggers it fires, as normal (undoable) progress.
import { isDone } from "../domain/tasks.ts";
import { matching, REENTRY_MS, type MeterEvent } from "../domain/triggers.ts";
import type { AppData, Task } from "../domain/types.ts";
import { setDone, stepCount, trackProgress } from "./progress.ts";

/**
 * Ticks what `ev` completes for a character: a task with goals gets its first unreached goal stepped, else it is done.
 * `entered`: task id → the map entry that last ticked it (re-entries within REENTRY_MS count once). Returns the tasks ticked.
 */
export function autoTick(data: AppData, charId: string, ev: MeterEvent, entered: Map<string, number>): Task[] {
  const out: Task[] = [];
  for (const t of matching(data.tasks, ev)) {
    const p = data.progress[charId]?.[t.id];
    if (isDone(t, p)) continue;
    if (ev.trigger.kind === "map") {
      if (ev.atMs - (entered.get(t.id) ?? -Infinity) < REENTRY_MS) continue;
      entered.set(t.id, ev.atMs);
    }
    const goal = t.goals?.findIndex((g, i) => (p?.counts?.[i] ?? 0) < g.target) ?? -1;
    trackProgress(data, charId, t.id, ev.atMs, () =>
      goal >= 0 ? stepCount(data, charId, t.id, goal, 1) : setDone(data, charId, t.id, true));
    out.push(t);
  }
  return out;
}
