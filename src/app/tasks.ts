// Task list editing use cases.
import { DEFAULT_MINUTES, DEFAULT_PRIORITY } from "../domain/planner.ts";
import { parseGoals } from "../domain/tasks.ts";
import type { AppData, Cadence } from "../domain/types.ts";

export const findTask = (data: AppData, id: string) => data.tasks.find((t) => t.id === id)!;

export const sortedTasks = (data: AppData, cad: Cadence) =>
  data.tasks.filter((t) => t.cadence === cad).sort((a, b) => a.order - b.order);

export function moveTask(data: AppData, id: string, dir: -1 | 1) {
  const t = findTask(data, id);
  const list = sortedTasks(data, t.cadence);
  list.forEach((x, i) => (x.order = i)); // normalize
  const j = list.indexOf(t) + dir;
  if (j < 0 || j >= list.length) return;
  [t.order, list[j].order] = [list[j].order, t.order];
}

/** Throws on invalid goal text, adding nothing. */
export function addTask(data: AppData, cadence: Cadence, name: string, category: string, goals: string) {
  data.tasks.push({
    id: crypto.randomUUID(), cadence, enabled: true, order: data.tasks.length, name,
    category: category.trim() || "Other",
    goals: parseGoals(goals),
  });
}

export function renameTask(data: AppData, id: string, v: string) { if (v.trim()) findTask(data, id).name = v.trim(); }
export function setTaskCategory(data: AppData, id: string, v: string) { if (v.trim()) findTask(data, id).category = v.trim(); }
export function setTaskNote(data: AppData, id: string, v: string) { findTask(data, id).note = v.trim() || undefined; }
/** Throws on invalid goal text, leaving the goals as they were. */
export function setTaskGoals(data: AppData, id: string, v: string) { findTask(data, id).goals = parseGoals(v); }
export function setTaskEnabled(data: AppData, id: string, on: boolean) { findTask(data, id).enabled = on; }

/** Planner estimate in minutes: 0.5..600, half-minute steps. */
export function setTaskMinutes(data: AppData, id: string, v: string) {
  findTask(data, id).minutes = Math.max(0.5, Math.min(600, Math.round(+v * 2) / 2 || DEFAULT_MINUTES));
}
/** Planner priority: 1 low · 2 normal · 3 high. */
export function setTaskPriority(data: AppData, id: string, v: string) {
  findTask(data, id).priority = Math.max(1, Math.min(3, +v || DEFAULT_PRIORITY));
}
