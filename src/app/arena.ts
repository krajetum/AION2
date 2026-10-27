// Arena log and field-boss use cases: what the meter sends, merged into the save file.
import { logKills, logMatch } from "../domain/arena.ts";
import { mergeBosses } from "../domain/bosses.ts";
import { mobKind, takeCubes, takeLoots, takeSouls } from "../domain/map.ts";
import { addSoulPoints, finishFromSilentKills, takeCollection } from "../domain/pets.ts";
import { takeOdyle, takeWallet } from "../domain/wallet.ts";
import type { MeterUpdate } from "../domain/meter.ts";
import type { AppData } from "../domain/types.ts";

/** The meter's loots already looked at this session (`takeLoots`); emptied when an item is named. */
export const seenLoots = new Set<string>();

/** Takes a meter update's boss timers, last arena match, hidden cubes (codes learned, cubes opened) and soul kills.
 *  Returns true if it changed data (needs saving). */
export function takeMeterData(data: AppData, u: MeterUpdate): boolean {
  const bosses = mergeBosses(data.bosses, u.bosses ?? []);
  if (bosses) data.bosses = bosses;
  const match = !!u.arena && logMatch(data.arena, u.arena);
  const cubes = !!u.cubes && takeCubes(data.map, u.cubes.codes, u.cubes.opened, u.position?.mapId ?? null);
  const kills = logKills(data.arena, u.kills ?? []) > 0;
  const souls = !!u.souls?.length && takeSouls(data.map, u.souls, u.profile?.name ?? "");
  const loots = !!u.loots?.length && takeLoots(data.map, u.loots, u.profile?.name ?? "", seenLoots);
  // The collection read on entering the world, then the soul points gained since (per character).
  const me = u.profile?.name ?? "";
  const read = !!u.pets && takeCollection(data.pets, me, u.pets);
  // Every soul point counts, placed on the map or not (an older meter sends only the placed ones).
  const gains = u.soulGains ?? u.souls ?? [];
  const gained = !!data.pets[me] && gains.length > 0 && addSoulPoints(data.pets[me], gains);
  // A pet a few points short whose mob's kills stopped giving points: done in game, its last points lost.
  const finished = !!data.pets[me] && !!u.loots?.length
    && finishFromSilentKills(data.pets[me], u.loots, gains, (mob) => mobKind(data.map, mob));
  // Currencies and Odyle energy, kept per character for the sidebar.
  const wallet = takeWallet(data.wallets, u.wallet);
  const odyle = takeOdyle(data.wallets, u.odyle, Date.now());
  return !!bosses || match || cubes || kills || souls || loots || read || gained || finished || wallet || odyle;
}

/** Names an arena map ("Arena of Solitude"); empty = unnamed. */
export function labelMap(data: AppData, mapId: number, v: string) {
  if (v.trim()) data.arena.maps[mapId] = v.trim();
  else delete data.arena.maps[mapId];
}
