// Use cases on the pet collections (AppData.pets, by character).
import { setPet } from "../domain/pets.ts";
import type { AppData } from "../domain/types.ts";

/**
 * The player's correction of one pet of a character's collection (what the game's Pets menu shows). With no
 * collection read yet, one is started now: the next read from the game (at login) replaces it.
 */
export function setPetProgress(data: AppData, me: string, id: number, level: number, points: number, now = Date.now()) {
  if (!me.trim()) return;
  setPet((data.pets[me] ??= { pets: [], atMs: now }), id, level, points);
}
