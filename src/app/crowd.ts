// Crowdsourcing use cases: share what the meter saw, take what other players saw (the Worker in server/).
// Failures only log: the app works the same without the Worker.
import { mergeBosses } from "../domain/bosses.ts";
import { bossesToShare, cubesToShare, MIN_EVERY, parseBosses, parseCubes } from "../domain/crowd.ts";
import type { MeterUpdate, OpenedCube } from "../domain/meter.ts";
import type { AppData } from "../domain/types.ts";
import { crowd } from "../infra/crowd.ts";

/** Seconds between boss reads (the Worker can ask for slower). */
export let bossEvery = MIN_EVERY;
let playedMs = 0; // last time the meter placed you in game
// ponytail: queued in memory, an app close drops up to 10 min of openings; persist it if that ever matters.
const cubes = new Map<number, OpenedCube[]>(); // map id → openings to send
const codes = new Set<number>();

const warn = (what: string) => (e: unknown) => console.warn(`Crowd ${what} failed`, e);

/** Playing now: the meter placed you in game within the last 5 minutes. */
export const gameActive = (now: number) => now - playedMs < 5 * 60_000;

/**
 * Before takeMeterData (it compares with the saved data): remembers the server, sends the maps read
 * since, queues new cube openings and codes. Returns true if it changed data (needs saving).
 */
export function shareFromMeter(data: AppData, u: MeterUpdate): boolean {
  if (u.demo) return false;
  if (u.position?.atMs) playedMs = Math.max(playedMs, u.position.atMs);
  const serverId = u.profile?.serverId;
  const changed = !!serverId && serverId !== data.serverId;
  if (changed) data.serverId = serverId;
  if (!data.settings.crowdShare) return changed;
  const maps = data.serverId ? bossesToShare(data.bosses, u.bosses ?? []) : [];
  if (maps.length) crowd("/v1/bosses", { install: data.install, serverId: data.serverId, sentMs: Date.now(), maps }).catch(warn("boss upload"));
  if (u.cubes) {
    const news = cubesToShare(data.map, u.cubes.opened, u.cubes.codes);
    const mapId = u.position?.mapId;
    if (mapId && news.cubes.length) cubes.set(mapId, [...(cubes.get(mapId) ?? []), ...news.cubes]);
    for (const c of news.codes) codes.add(c);
  }
  return changed;
}

/** Sends the queued cube openings (every 10 min). Codes go with the first map's batch. */
export async function flushCubes(data: AppData) {
  if (!data.settings.crowdShare) return void cubes.clear();
  for (const [mapId, list] of [...cubes]) {
    cubes.delete(mapId);
    const sent = [...codes];
    codes.clear();
    await crowd("/v1/cubes", { install: data.install, sentMs: Date.now(), mapId, cubes: list.slice(-50), codes: sent }).catch(warn("cube upload"));
  }
}

/** Other players' timers for your server into data.bosses (newer reads win). Returns true if it changed data. */
export async function syncBosses(data: AppData): Promise<boolean> {
  if (!data.serverId) return false;
  try {
    const { timers, every } = parseBosses(await crowd(`/v1/bosses/${data.serverId}`), Date.now());
    bossEvery = every;
    const merged = mergeBosses(data.bosses, timers);
    if (merged) data.bosses = merged;
    return !!merged;
  } catch (e) { warn("boss download")(e); return false; }
}

/** Confirmed cube spots into map.shared, confirmed codes into map.cubeCodes.
 *  Returns whether data changed and whether codes did (the meter needs them). */
export async function syncCubes(data: AppData): Promise<{ changed: boolean; codes: boolean }> {
  try {
    const got = parseCubes(await crowd("/v1/cubes"));
    const added = got.codes.filter((c) => !data.map.cubeCodes.includes(c));
    if (added.length) data.map.cubeCodes = [...data.map.cubeCodes, ...added].sort((a, b) => a - b);
    data.map.shared = got.spots;
    return { changed: true, codes: added.length > 0 };
  } catch (e) { warn("cube download")(e); return { changed: false, codes: false }; }
}
