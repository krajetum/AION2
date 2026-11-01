// The player's own best-in-slot lists (domain/bis.ts): set one for a class and slot, or go back to the bundled one.
import type { BisLine } from "../domain/bis.ts";
import type { AppData } from "../domain/types.ts";

/** `lines` null = back to the bundled list. Empty lines are dropped. */
export function setBis(data: AppData, className: string, slot: string, lines: BisLine[] | null) {
  if (!lines) {
    delete data.bis[className]?.[slot];
    if (data.bis[className] && !Object.keys(data.bis[className]).length) delete data.bis[className];
    return;
  }
  const kept = lines.map((l) => ({ ...l, stat: l.stat.trim(), value: l.value.trim() })).filter((l) => l.stat);
  (data.bis[className] ??= {})[slot] = kept;
}
