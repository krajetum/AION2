// The reset rule: clears progress whose reset boundary passed. Pure: tested with `npm test`.
import type { ResetConfig } from "../config.ts";
import { lastBoundary } from "./time.ts";
import { CADENCES, type AppData, type Cadence } from "./types.ts";

/** Clears tasks of every cadence whose reset passed since the last save
 *  (even if the app was closed). Returns the cadences that were reset. */
export function applyResets(data: AppData, now: number, c: ResetConfig): Cadence[] {
  const done: Cadence[] = [];
  for (const cad of CADENCES) {
    const b = lastBoundary(cad, now, c);
    if ((data.lastReset[cad] ?? 0) >= b) continue;
    const ids = new Set(data.tasks.filter((t) => t.cadence === cad).map((t) => t.id));
    for (const prog of Object.values(data.progress)) for (const id of ids) delete prog[id];
    // An undo across a reset would bring back last cycle's progress: drop entries touching these tasks.
    data.undo = (data.undo ?? []).filter((e) => !Object.keys(e.before).some((id) => ids.has(id)));
    data.lastReset[cad] = b;
    done.push(cad);
  }
  return done;
}
