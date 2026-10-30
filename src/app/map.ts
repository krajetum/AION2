// Map page use cases: points on the map images (cube spots and references), pets' soul point drops.
import { linkKinds, mergeDrops, type FileNames, type MapKey, type MapPoint, type PetDrop, type PointKind, type SoulNames } from "../domain/map.ts";
import type { AppData } from "../domain/types.ts";
import { seenLoots } from "./arena.ts";

export function addPoint(data: AppData, map: MapKey, x: number, y: number, kind: PointKind, group: number): MapPoint {
  const p: MapPoint = { id: crypto.randomUUID(), map, x: Math.round(x), y: Math.round(y), kind, group, label: "" };
  data.map.points.push(p);
  return p;
}

const find = (data: AppData, id: string) => data.map.points.find((p) => p.id === id);

export function deletePoint(data: AppData, id: string) {
  data.map.points = data.map.points.filter((p) => p.id !== id);
}
export function setPointLabel(data: AppData, id: string, label: string) { const p = find(data, id); if (p) p.label = label.trim(); }
export function setPointGroup(data: AppData, id: string, group: number) { const p = find(data, id); if (p) p.group = group; }
export function setPointKind(data: AppData, id: string, kind: PointKind) {
  const p = find(data, id);
  if (!p) return;
  p.kind = kind;
  if (kind === "cube") delete p.game;
}
/** A reference's game coordinates; an empty or invalid field clears them. */
export function setPointGame(data: AppData, id: string, gx: string, gy: string) {
  const p = find(data, id);
  if (!p) return;
  const x = parseFloat(gx), y = parseFloat(gy);
  if (Number.isFinite(x) && Number.isFinite(y)) p.game = { x, y };
  else delete p.game;
}

/** Soul points by hand at a place in game units (your position, or a click on a fitted map). */
export function addDrop(data: AppData, pet: string, map: MapKey, mapId: number | null, x: number, y: number, z: number, by: string, atMs = Date.now()): PetDrop {
  const d: PetDrop = { id: crypto.randomUUID(), pet: pet.trim(), mapId, map, x: Math.round(x), y: Math.round(y), z: Math.round(z), atMs, by };
  data.map.pets.push(d);
  return d;
}
export function deleteDrop(data: AppData, id: string) {
  data.map.pets = data.map.pets.filter((d) => d.id !== id);
}
/** Friends' drops (and their soul names) into yours; returns how many drops were new. */
export const importDrops = (data: AppData, drops: PetDrop[], names: Partial<FileNames>) => mergeDrops(data.map, drops, names);
/** Names an item code as a crystal / shard of a soul (empty = not one); this session's loots of it are looked at again. */
export function setItemSoul(data: AppData, item: number, soul: string) {
  if (soul.trim()) data.map.items[String(item)] = soul.trim();
  else delete data.map.items[String(item)];
  seenLoots.clear();
}
/** The soul a mob's kills give; empty = back to the name each drop was recorded with. */
export function setMobSoul(data: AppData, mob: string, soul: string) {
  const k = mob.trim().toLowerCase();
  if (!k) return;
  if (soul.trim()) data.map.souls[k] = soul.trim();
  else delete data.map.souls[k];
}

/** The player's name for a pet number; empty = back to the mob's name or the number. */
export function setPetName(data: AppData, id: number, name: string) {
  if (name.trim()) data.map.petNames[String(id)] = name.trim();
  else delete data.map.petNames[String(id)];
}

/**
 * The pet a mob's kills give, as the player knows it (a spot recorded with no pet number): every unnumbered kill of
 * that mob gets it (`linkKinds`); null forgets it, and those kills go back to what their other kills say.
 */
export function setMobPet(data: AppData, mob: string, pet: number | null) {
  const m = mob.trim().toLowerCase();
  if (!m) return;
  if (pet == null) delete data.map.mobPets[m];
  else data.map.mobPets[m] = pet;
  for (const d of data.map.pets) if (d.linked && d.mob?.toLowerCase() === m) { delete d.kind; delete d.linked; }
  linkKinds(data.map);
}
