// The soul points popup (src/ui/SoulsOverlay.svelte, its own window over the game): your kills that gave soul points
// to a pet you still need (`wanted`), added up on screen while
// they come within COMBO_MS of each other: "COMBO" from the second, "ON FIRE" from the ON_FIRE-th. Pure.

import { maxed, needed, petName, type PetCollection, type SoulGain } from "./pets.ts";
import type { SoulNames } from "./map.ts";

/** A gain this soon after the last keeps the combo going, and the popup stays this long after the last, both counted
 *  from when the app got it (the meter's own times run up to a second earlier, and the popup came and went too fast). */
export const COMBO_MS = 3_000;
/** From this many gains in a row the combo is on fire. */
export const ON_FIRE = 10;

/** What the popup shows: soul points and shards of this combo, how many gains, the last pet's name and where it
 *  stands (`progress`, e.g. "12/25 to level 2"), `lastMs` = when the app got the last gain. */
export interface SoulPop { points: number; shards: number; hits: number; lastMs: number; label: string; progress?: string }

/** New gains since `seenMs` to show: soul points of pets not done (all of them while no collection is known), crystals. */
// No crystals / shards: none of the 61053xxxx loots is a pet's (recordings of 2026-11-22: 610530014, 610530001 and
// 610531002 dropped from Spirit Guardians, Blood Spiders, Mumu Workers and Overseers alike, each next to its kill's own
// soul point, and on mobs of a finished pet with none), so the popup showed "+1 shard" for nothing.
export function freshGains(c: PetCollection | undefined, gains: SoulGain[], seenMs: number) {
  const points = gains.filter((g) => g.atMs > seenMs && g.points > 0 && g.kind != null && !maxed(c?.pets.find((p) => p.id === g.kind)));
  const lastMs = Math.max(seenMs, ...gains.map((g) => g.atMs));
  return { points, shards: [] as { atMs: number }[], lastMs };
}

/** The combo with one more gain (`points` soul points or `shards` crystals) at `atMs`: a new combo after COMBO_MS. */
export function addGain(pop: SoulPop | null, points: number, shards: number, label: string, atMs: number): SoulPop {
  const going = pop && atMs - pop.lastMs <= COMBO_MS;
  return going
    ? { points: pop.points + points, shards: pop.shards + shards, hits: pop.hits + 1, lastMs: Math.max(pop.lastMs, atMs), label: label || pop.label }
    : { points, shards, hits: 1, lastMs: atMs, label };
}

/** Every fresh gain into the combo, oldest first, as got at `nowMs`; null when there was none. */
export function popGains(pop: SoulPop | null, fresh: ReturnType<typeof freshGains>, names: { petNames: SoulNames; kinds: SoulNames }, nowMs: number): SoulPop | null {
  const all = [
    ...fresh.points.map((g) => ({ atMs: g.atMs, points: g.points, shards: 0, label: petName(g.kind!, names.petNames, names.kinds) })),
    ...fresh.shards.map((l) => ({ atMs: l.atMs, points: 0, shards: 1, label: "" })),
  ].sort((a, b) => a.atMs - b.atMs);
  if (!all.length) return null;
  return all.reduce<SoulPop | null>((p, g) => addGain(p, g.points, g.shards, g.label, nowMs), pop);
}

/** Where the pet of the last gain stands after it, for the popup: "12/25 to level 2", "unlocked", "level 3: done". */
export function progressText(c: PetCollection | undefined, kind: number | undefined): string | undefined {
  const p = kind == null ? undefined : c?.pets.find((x) => x.id === kind);
  if (!p) return undefined;
  if (maxed(p)) return `level ${p.level}: done`;
  const need = needed(p);
  return p.level < 1 ? `${p.points}/${need} to unlock` : `${p.points}/${need} to level ${p.level + 1}`;
}

/** The popup's sizes (Settings): scale of the M window (src-tauri/src/meter.rs SOULS_SIZE, 220 × 84). */
export const SOUL_POPUP_SIZES: [number, string][] = [[0.7, "XS"], [0.85, "S"], [1, "M"], [1.25, "L"], [1.6, "XL"]];

export const onFire = (p: SoulPop) => p.hits >= ON_FIRE;
export const isCombo = (p: SoulPop) => p.hits >= 2;
/** "+12 soul points · +1 shard". */
export function popText(p: SoulPop): string {
  const parts = [];
  if (p.points) parts.push(`+${p.points} soul point${p.points === 1 ? "" : "s"}`);
  if (p.shards) parts.push(`+${p.shards} shard${p.shards === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
