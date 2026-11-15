// The reset rule: clears progress whose reset boundary passed. Pure: tested with `npm test`.
import type { ResetConfig } from "../config.ts";
import { emptyHistory, recordDaily } from "./history.ts";
import { allDone } from "./tasks.ts";
import { lastBoundary } from "./time.ts";
import { CADENCES, type AppData, type Cadence } from "./types.ts";

/** Clears tasks of every cadence whose reset passed since the last save
 *  (even if the app was closed). Returns the cadences that were reset. */
export function applyResets(data: AppData, now: number, c: ResetConfig): Cadence[] {
  const done: Cadence[] = [];
  for (const cad of CADENCES) {
    const b = lastBoundary(cad, now, c);
    if ((data.lastReset[cad] ?? 0) >= b) continue;
    // A daily cycle a character finished goes in the history first (Home's streak strip): the cycle that started
    // at the last applied reset, whatever number of resets passed while the app was closed.
    if (cad === "daily") {
      data.history ??= emptyHistory();
      for (const charId of Object.keys(data.progress)) if (allDone(data, charId, "daily")) recordDaily(data.history, charId, data.lastReset.daily ?? 0);
    }
    const ids = new Set(data.tasks.filter((t) => t.cadence === cad).map((t) => t.id));
    for (const prog of Object.values(data.progress)) for (const id of ids) delete prog[id];
    // An undo across a reset would bring back last cycle's progress: drop entries touching these tasks.
    data.undo = (data.undo ?? []).filter((e) => !Object.keys(e.before).some((id) => ids.has(id)));
    data.lastReset[cad] = b;
    done.push(cad);
  }
  return done;
}
