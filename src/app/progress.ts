// Task progress use cases: ticks, goal counters, cadence reset. Each tracked change is undoable
// and, during a Planner session, times the task to refine its estimate.
import { DEFAULT_MINUTES, learn, leftShare } from "../domain/planner.ts";
import type { AppData, Cadence, Progress } from "../domain/types.ts";
import { pushUndo } from "../domain/undo.ts";
import { activePlan, MIN } from "./planner.ts";
import { findTask } from "./tasks.ts";

export const progressOf = (data: AppData, charId: string, taskId: string) =>
  ((data.progress[charId] ??= {})[taskId] ??= { done: false });

export function setCount(data: AppData, charId: string, id: string, i: number, v: number) {
  const goals = findTask(data, id).goals!;
  const p = progressOf(data, charId, id);
  p.counts ??= [];
  p.counts[i] = Math.max(0, Math.min(goals[i].target, Math.round(v) || 0));
  p.done = goals.every((x, j) => (p.counts![j] ?? 0) >= x.target);
}

/** "+" / "−" on a goal: moves the count by the goal's step. */
export function stepCount(data: AppData, charId: string, id: string, i: number, dir: 1 | -1) {
  const g = findTask(data, id).goals![i];
  setCount(data, charId, id, i, (progressOf(data, charId, id).counts?.[i] ?? 0) + dir * (g.step ?? 1));
}

/** Checkbox. Unticking a goal task whose goals are all reached clears its counts too,
 *  otherwise isDone() would keep it done; partial counts are kept. */
export function setDone(data: AppData, charId: string, id: string, done: boolean) {
  const t = findTask(data, id), p = progressOf(data, charId, id);
  p.done = done;
  if (!done && t.goals?.every((g, i) => (p.counts?.[i] ?? 0) >= g.target)) p.counts = [];
}

// A plain copy (not structuredClone: the UI's data is a reactive proxy, which can't be cloned).
const copy = (p?: Progress): Progress | null => (p ? { ...p, ...(p.counts && { counts: [...p.counts] }) } : null);

/** Runs a progress change as one undo step; during a session, times it to refine the task's estimate.
 *  Returns the share of the task still to do afterwards (0 = done). */
export function trackProgress(data: AppData, charId: string, id: string, now: number, change: () => void) {
  const t = findTask(data, id), before = leftShare(t, data.progress[charId]?.[id]);
  pushUndo(data, charId, t.name, { [id]: copy(data.progress[charId]?.[id]) }, now);
  change();
  const after = leftShare(t, data.progress[charId]?.[id]);
  const pl = activePlan(data, charId, now), share = before - after;
  if (pl && share > 0) {
    t.minutes = learn(t.minutes ?? DEFAULT_MINUTES, (now - pl.lastMark) / MIN, share);
    pl.lastMark = now;
  }
  return after;
}

/** Clears one cadence's progress for a character as one undo step. Returns false if there was nothing to clear. */
export function resetCadence(data: AppData, charId: string, cad: Cadence, label: string, now: number) {
  const prog = data.progress[charId] ?? {}, before: Record<string, Progress> = {};
  for (const t of data.tasks) if (t.cadence === cad && prog[t.id]) { before[t.id] = prog[t.id]; delete prog[t.id]; }
  if (!Object.keys(before).length) return false;
  pushUndo(data, charId, label, before, now);
  return true;
}
