// Character use cases.
import type { AppData } from "../domain/types.ts";

export function addCharacter(data: AppData, name: string) {
  data.characters.push({ id: crypto.randomUUID(), name });
}

export function renameCharacter(data: AppData, id: string, v: string) {
  if (v.trim()) data.characters.find((c) => c.id === id)!.name = v.trim();
}

/** Removes the character with all its progress and season data. The caller keeps at least one. */
export function deleteCharacter(data: AppData, id: string) {
  data.characters = data.characters.filter((c) => c.id !== id);
  delete data.progress[id];
  delete data.season[id];
}
