// Crowdsourcing rules (the Cloudflare Worker in server/, src/app/crowd.ts): what of the meter's news to
// share, and the Worker's answers read back onto this PC's clock. Pure.
import { newerMaps } from "./bosses.ts";
import { cleanShared, SAME_SPOT, type MapData, type SharedCube } from "./map.ts";
import type { BossTimer, OpenedCube } from "./meter.ts";

/** Seconds between boss reads: never faster than this, slower when the Worker says so. */
export const MIN_EVERY = 120;

/** The maps the meter read since the saved ones (what mergeBosses will take), grouped by map. */
export function bossesToShare(saved: BossTimer[], fresh: BossTimer[]): { mapId: number; timers: BossTimer[] }[] {
  const newer = newerMaps(saved, fresh);
  return [...newer].map((mapId) => ({ mapId, timers: fresh.filter((b) => b.mapId === mapId) }));
}

/** The openings takeCubes will add or refresh, and the codes it will learn. */
export function cubesToShare(map: MapData, opened: OpenedCube[], codes: number[]): { cubes: OpenedCube[]; codes: number[] } {
  return {
    cubes: opened.filter((o) => {
      const same = map.found.find((f) => Math.hypot(f.x - o.x, f.y - o.y) < SAME_SPOT);
      return !same || o.atMs > same.atMs;
    }),
    codes: codes.filter((c) => !map.cubeCodes.includes(c)),
  };
}

const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const every = (j: any) => Math.max(MIN_EVERY, ok(j?.every) ? j.every : 0);

/** GET /v1/bosses/:serverId → timers on this PC's clock (the Worker's times are its own). Malformed ones are dropped. */
export function parseBosses(j: any, localNow: number): { timers: BossTimer[]; every: number } {
  if (!ok(j?.serverNow) || !Array.isArray(j.maps)) return { timers: [], every: every(j) };
  const shift = localNow - j.serverNow;
  const timers: BossTimer[] = [];
  for (const m of j.maps) {
    if (!Number.isInteger(m?.mapId) || !ok(m.seenMs) || !Array.isArray(m.timers)) continue;
    for (const t of m.timers) {
      if (!Number.isInteger(t?.bossId) || !ok(t.timeMs)) continue;
      timers.push({
        mapId: m.mapId, bossId: t.bossId, name: typeof t.name === "string" ? t.name.slice(0, 64) : "", up: !!t.up,
        timeMs: t.timeMs ? t.timeMs + shift : 0, seenMs: m.seenMs + shift,
      });
    }
  }
  return { timers, every: every(j) };
}

/** GET /v1/cubes → spots and codes other players confirmed. */
export function parseCubes(j: any): { spots: SharedCube[]; codes: number[] } {
  return {
    spots: cleanShared(j?.spots),
    codes: (Array.isArray(j?.codes) ? j.codes : []).filter((c: unknown) => Number.isInteger(c) && (c as number) > 0),
  };
}
