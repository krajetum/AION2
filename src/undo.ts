// Undo history for task progress (ticks, counters, resets). Saved with the data; pruned by applyResets.
// Pure: tested with `npm test`. Not undone: learned Planner estimates and Season Coins edits.
import type { AppData, Progress } from "./types.ts";

const MAX = 30;
const COALESCE_MS = 3000; // repeated changes to one task within 3 s = one undo (e.g. clicking "+" ten times)

/** Records the state of the touched tasks before a change. before[taskId] = null → the task had no progress. */
export function pushUndo(data: AppData, charId: string, label: string, before: Record<string, Progress | null>, now: number) {
  const last = data.undo.at(-1), ids = Object.keys(before);
  if (last && last.charId === charId && now - last.at < COALESCE_MS && ids.length === 1
    && Object.keys(last.before).length === 1 && ids[0] in last.before) {
    last.at = now; // keep the older `before`: one undo goes back to before the whole burst
    return;
  }
  data.undo.push({ charId, label, at: now, before });
  if (data.undo.length > MAX) data.undo.splice(0, data.undo.length - MAX);
}

/** Restores the newest entry of this character. Returns its label, or undefined if there is nothing to undo. */
export function popUndo(data: AppData, charId: string): string | undefined {
  const i = lastIndex(data, charId);
  if (i < 0) return undefined;
  const [e] = data.undo.splice(i, 1), prog = (data.progress[charId] ??= {});
  for (const [id, p] of Object.entries(e.before)) if (p) prog[id] = p; else delete prog[id];
  return e.label;
}

function lastIndex(data: AppData, charId: string) {
  let i = data.undo.length - 1;
  while (i >= 0 && data.undo[i].charId !== charId) i--;
  return i;
}

export const lastUndo = (data: AppData, charId: string) => data.undo[lastIndex(data, charId)];
