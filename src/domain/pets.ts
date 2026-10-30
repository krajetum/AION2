// Your pet collection (src-tauri/meter/src/pets.rs: sent on entering the world: login or character select) and the rules around it.
// Pure. A pet is a number (the game sends no names); the soul points' kind of a kill is the same number, so the
// map's spots and the collection meet on it.
//
// Levels, from the guide (allthings.how, "How to unlock any pet by farming pet souls") and the collection read on
// 2026-10-26: 5 soul points unlock a pet, 25 more take it to level 2, 75 more to level 3, the last. In that
// collection no level 1 pet had more than 24 points, no level 2 pet more than 66, and every level 3 pet 0.

import type { SoulNames } from "./map.ts";
import { KNOWN_PET_NAMES } from "./pet-names.ts";

export interface Pet { id: number; level: number; points: number }
/** atMs: the last change taken (the read, then each gain); readMs: when the game sent it (older saves: none). */
export interface PetCollection { pets: Pet[]; atMs: number; readMs?: number }
/** A kill's soul points, as far as the collection needs them. */
export interface SoulGain { kind?: number; points: number; atMs: number }

export const MAX_LEVEL = 3;
export const UNLOCK = 5;
/** Soul points from a level to the next. */
export const NEXT: Record<number, number> = { 1: 25, 2: 75 };

/** The points a pet needs for its next level (to unlock it, when not owned), 0 at the last level. */
export const needed = (p: Pet | undefined) => (!p || p.level < 1 ? UNLOCK : NEXT[p.level] ?? 0);
export const maxed = (p: Pet | undefined) => !!p && p.level >= MAX_LEVEL;

export function cleanCollection(raw: any): PetCollection | null {
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  if (!raw || !Array.isArray(raw.pets) || !ok(raw.atMs)) return null;
  const pets = raw.pets.filter((p: any) => p && ok(p.id) && ok(p.level) && ok(p.points)).map((p: any): Pet => ({ id: p.id, level: p.level, points: p.points }));
  return { pets, atMs: raw.atMs, ...(ok(raw.readMs) && { readMs: raw.readMs }) };
}

/** Collections by character name, cleaned. */
export function cleanCollections(raw: any): Record<string, PetCollection> {
  const out: Record<string, PetCollection> = {};
  if (raw && typeof raw === "object") for (const [name, c] of Object.entries(raw)) {
    const clean = cleanCollection(c);
    if (name.trim() && clean) out[name] = clean;
  }
  return out;
}

/**
 * Soul points gained after the collection was read, added to it: a pet levels up at its threshold (the points
 * over it carry on), stops at the last level, and is unlocked at 5. Returns true if anything changed.
 */
export function addSoulPoints(c: PetCollection, gains: SoulGain[]): boolean {
  let changed = false;
  for (const g of gains) {
    if (g.atMs <= c.atMs || g.kind == null) continue;
    c.atMs = g.atMs;
    changed = true;
    let p = c.pets.find((p) => p.id === g.kind);
    if (!p) c.pets.push((p = { id: g.kind, level: 0, points: 0 }));
    if (maxed(p)) continue;
    p.points += g.points;
    for (let need = needed(p); need && p.points >= need; need = needed(p)) {
      p.points -= need;
      p.level++;
    }
    if (maxed(p)) p.points = 0;
  }
  return changed;
}

/** A loot of yours (the meter's `loots`): the kill it came from. */
export interface KillLoot { entity: number; mob: string; atMs: number }
/** Soul points come this long after a kill's loot at most (seen: 0.2-0.7 s). */
export const POINTS_AFTER_MS = 3_000;
/** A pet this close to its last level is done if its mob's kills stop giving points. */
const NEARLY_DONE = 3;

/**
 * Pets the game finished while a soul point on the way was lost (packets lost): at its last level a pet's mobs
 * give no more soul points (the players, 2026-10-26), so the count stays one or two short for good (Forest Guardian
 * at 74/75, 2026-10-27). Two kills of yours after the read, of a mob that always gave this pet (`petOfMob`), with
 * no points of it within POINTS_AFTER_MS, finish a pet at level 2 that is at most 3 points short. Returns true if
 * anything changed.
 */
export function finishFromSilentKills(c: PetCollection, loots: KillLoot[], gains: SoulGain[], petOfMob: (mob: string) => number | null): boolean {
  const silent = new Map<number, Set<number>>();
  // Only pets nearly done matter: without one, no mob is looked up (the meter resends its last loots 5 times a second).
  if (!c.pets.some((p) => p.level === MAX_LEVEL - 1 && needed(p) - p.points <= NEARLY_DONE)) return false;
  for (const l of loots) {
    if (l.atMs <= (c.readMs ?? c.atMs) || !l.mob) continue;
    const id = petOfMob(l.mob);
    const p = id == null ? undefined : c.pets.find((p) => p.id === id);
    if (!p || p.level !== MAX_LEVEL - 1 || needed(p) - p.points > NEARLY_DONE) continue;
    if (gains.some((g) => g.kind === id && g.atMs >= l.atMs && g.atMs - l.atMs <= POINTS_AFTER_MS)) continue;
    if (Date.now() - l.atMs < POINTS_AFTER_MS) continue; // its points may still come
    const s = silent.get(id!) ?? new Set<number>();
    s.add(l.entity);
    silent.set(id!, s);
  }
  let changed = false;
  for (const [id, kills] of silent) {
    if (kills.size < 2) continue;
    const p = c.pets.find((p) => p.id === id)!;
    p.level = MAX_LEVEL;
    p.points = 0;
    changed = true;
  }
  return changed;
}

/** The collection a new read replaces, unless it is older than the one kept. Returns true if it was taken. */
export function takeCollection(all: Record<string, PetCollection>, name: string, c: PetCollection): boolean {
  if (!name.trim() || (all[name] && all[name].atMs >= c.atMs)) return false;
  all[name] = { pets: c.pets.map((p) => ({ ...p })), atMs: c.atMs, readMs: c.atMs };
  return true;
}

/** A pet's name: the player's, else the database's (pet-names.ts), else the mob its soul points were seen with, else its number. */
export const petName = (id: number, petNames: SoulNames, kinds: SoulNames) =>
  petNames[String(id)] || KNOWN_PET_NAMES[id] || kinds[String(id)] || `Pet #${id}`;

/** Whether a pet number still needs soul points (not owned, or below the last level): what "unobtained" shows. */
export const wanted = (c: PetCollection | undefined, id: number) => !maxed(c?.pets.find((p) => p.id === id));
