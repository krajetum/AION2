// The soul points popup (src/ui/SoulsOverlay.svelte, its own window over the game): your kills that gave soul points
// to a pet you still need (`wanted`) and your loots of a pet's crystal / shard (`lootKind`), added up on screen while
// they come within COMBO_MS of each other: "COMBO" from the second, "ON FIRE" from the ON_FIRE-th. Pure.

import { lootKind } from "./map.ts";
import { maxed, petName, type PetCollection, type SoulGain } from "./pets.ts";
import type { SoulNames } from "./map.ts";

/** A gain this soon after the last keeps the combo going; the popup stays this long after the last. */
export const COMBO_MS = 3_000;
/** From this many gains in a row the combo is on fire. */
export const ON_FIRE = 10;

/** What the popup shows: soul points and shards of this combo, how many gains, the last pet's name. */
export interface SoulPop { points: number; shards: number; hits: number; lastMs: number; label: string }

/** New gains since `seenMs` to show: soul points of pets not done (all of them while no collection is known), crystals. */
export function freshGains(c: PetCollection | undefined, gains: SoulGain[], loots: { item: number; atMs: number }[], seenMs: number) {
  const points = gains.filter((g) => g.atMs > seenMs && g.points > 0 && g.kind != null && !maxed(c?.pets.find((p) => p.id === g.kind)));
  const shards = loots.filter((l) => l.atMs > seenMs && lootKind(l.item) === "crystal");
  const lastMs = Math.max(seenMs, ...gains.map((g) => g.atMs), ...loots.map((l) => l.atMs));
  return { points, shards, lastMs };
}

/** The combo with one more gain (`points` soul points or `shards` crystals) at `atMs`: a new combo after COMBO_MS. */
export function addGain(pop: SoulPop | null, points: number, shards: number, label: string, atMs: number): SoulPop {
  const going = pop && atMs - pop.lastMs <= COMBO_MS;
  return going
    ? { points: pop.points + points, shards: pop.shards + shards, hits: pop.hits + 1, lastMs: Math.max(pop.lastMs, atMs), label: label || pop.label }
    : { points, shards, hits: 1, lastMs: atMs, label };
}

/** Every fresh gain into the combo, oldest first; null when there was none. */
export function popGains(pop: SoulPop | null, fresh: ReturnType<typeof freshGains>, names: { petNames: SoulNames; kinds: SoulNames }): SoulPop | null {
  const all = [
    ...fresh.points.map((g) => ({ atMs: g.atMs, points: g.points, shards: 0, label: petName(g.kind!, names.petNames, names.kinds) })),
    ...fresh.shards.map((l) => ({ atMs: l.atMs, points: 0, shards: 1, label: "" })),
  ].sort((a, b) => a.atMs - b.atMs);
  if (!all.length) return null;
  return all.reduce<SoulPop | null>((p, g) => addGain(p, g.points, g.shards, g.label, g.atMs), pop);
}

export const onFire = (p: SoulPop) => p.hits >= ON_FIRE;
export const isCombo = (p: SoulPop) => p.hits >= 2;
/** "+12 soul points · +1 shard". */
export function popText(p: SoulPop): string {
  const parts = [];
  if (p.points) parts.push(`+${p.points} soul point${p.points === 1 ? "" : "s"}`);
  if (p.shards) parts.push(`+${p.shards} shard${p.shards === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
