// Task completion rules and the goal text format. Pure: tested with `npm test`.
import type { AppData, Cadence, Goal, Progress, Task } from "./types.ts";

/** Done = ticked manually or every goal reached. */
export function isDone(t: Task, p?: Progress) {
  if (p?.done) return true;
  return !!t.goals?.length && t.goals.every((g, i) => (p?.counts?.[i] ?? 0) >= g.target);
}

/** Enabled, unfinished tasks per character for one cadence. */
export function remaining(data: AppData, cad: Cadence) {
  return data.characters.map((ch) => ({
    name: ch.name,
    left: data.tasks.filter((t) => t.enabled && t.cadence === cad && !isDone(t, data.progress[ch.id]?.[t.id])).length,
  }));
}

// "Wins:30, Entries:10" | "2000" | "Level:50/5"
export function parseGoals(s: string): Goal[] | undefined {
  const goals = s.split(",").map((x) => x.trim()).filter(Boolean).map((part) => {
    const m = part.match(/^(?:(.+?)\s*:\s*)?(\d+)(?:\s*\/\s*(\d+))?$/);
    if (!m) throw new Error(`Invalid goal: "${part}"`);
    return { label: m[1] || undefined, target: +m[2], step: m[3] ? +m[3] : undefined };
  });
  return goals.length ? goals : undefined;
}
export const formatGoals = (g?: Goal[]) =>
  (g ?? []).map((x) => `${x.label ? x.label + ":" : ""}${x.target}${x.step ? "/" + x.step : ""}`).join(", ");
