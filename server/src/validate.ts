// Request bodies from the app, checked and clamped at the trust boundary. Pure, no Workers APIs.
// Times come from the player's clock: shifted by `serverNow - sentMs` so a wrong clock can't push data into the future.

export const MAX_BODY = 16 * 1024;
export const MAX_TIMERS = 64; // per POST, all maps together
export const MAX_MAPS = 32;
export const MAX_CUBES = 50;
export const MAX_CODES = 50;
export const MAX_NAME = 64;
/** Times further than this from now (after the clock shift) are dropped. */
export const TIME_RANGE = 48 * 3600_000;
/** Grid of a cube spot, game units (SAME_SPOT in src/domain/map.ts). */
export const CELL = 300;

export interface BossTimer { mapId: number; bossId: number; name: string; up: boolean; timeMs: number; seenMs: number }
export interface BossPost { install: string; serverId: number; maps: { mapId: number; timers: BossTimer[] }[] }
export interface Cube { x: number; y: number; z: number; code: number | null; atMs: number }
export interface CubePost { install: string; mapId: number; cubes: Cube[]; codes: number[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Offset from the player's clock to ours, or null when `sentMs` isn't a time. */
function offsetOf(sentMs: unknown, serverNow: number): number | null {
  return isNum(sentMs) && sentMs > 0 ? serverNow - sentMs : null;
}

/** A player time on our clock, or null when out of range. 0 (unknown) stays 0. */
function shift(t: number, offset: number, serverNow: number): number | null {
  if (t === 0) return 0;
  const s = t + offset;
  return Math.abs(s - serverNow) <= TIME_RANGE ? s : null;
}

/** POST /v1/bosses. Null = 400. Bad timers are dropped, every timer is stamped `seenMs = serverNow`. */
export function parseBossPost(body: unknown, serverNow: number): BossPost | null {
  if (!isObj(body) || typeof body.install !== "string" || !UUID.test(body.install) || !isId(body.serverId)) return null;
  const offset = offsetOf(body.sentMs, serverNow);
  if (offset === null || !Array.isArray(body.maps) || body.maps.length > MAX_MAPS) return null;
  let total = 0;
  const maps: BossPost["maps"] = [];
  for (const m of body.maps) {
    if (!isObj(m) || !isId(m.mapId) || !Array.isArray(m.timers)) return null;
    total += m.timers.length;
    if (total > MAX_TIMERS) return null;
    const timers: BossTimer[] = [];
    for (const t of m.timers) {
      if (!isObj(t) || !isId(t.bossId) || typeof t.up !== "boolean" || !isNum(t.timeMs) || t.timeMs < 0) continue;
      const timeMs = shift(t.timeMs, offset, serverNow);
      if (timeMs === null) continue;
      const name = typeof t.name === "string" ? t.name.slice(0, MAX_NAME) : "";
      timers.push({ mapId: m.mapId, bossId: t.bossId, name, up: t.up, timeMs, seenMs: serverNow });
    }
    if (timers.length) maps.push({ mapId: m.mapId, timers });
  }
  return { install: body.install.toLowerCase(), serverId: body.serverId, maps };
}

/** POST /v1/cubes. Null = 400. Bad cubes and codes are dropped. */
export function parseCubePost(body: unknown, serverNow: number): CubePost | null {
  if (!isObj(body) || typeof body.install !== "string" || !UUID.test(body.install) || !isId(body.mapId)) return null;
  const offset = offsetOf(body.sentMs, serverNow);
  const codesIn = body.codes ?? [];
  if (offset === null || !Array.isArray(body.cubes) || body.cubes.length > MAX_CUBES
    || !Array.isArray(codesIn) || codesIn.length > MAX_CODES) return null;
  const cubes: Cube[] = [];
  for (const c of body.cubes) {
    if (!isObj(c) || !isNum(c.x) || !isNum(c.y) || !isNum(c.z) || !isNum(c.atMs) || c.atMs <= 0) continue;
    if (c.code != null && !isId(c.code)) continue;
    const atMs = shift(c.atMs, offset, serverNow);
    if (atMs === null) continue;
    cubes.push({ x: c.x, y: c.y, z: c.z, code: c.code ?? null, atMs });
  }
  const codes = [...new Set(codesIn.filter(isId))];
  return { install: body.install.toLowerCase(), mapId: body.mapId, cubes, codes };
}

/** The spot a cube belongs to: one install counts once per cell. */
// ponytail: fixed grid, two openings of one cube can straddle a cell edge; cluster by distance if spots come out split.
export function cellOf(x: number, y: number): string {
  return `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
}

/** The serverId of GET /v1/bosses/:serverId, or null. */
export function parseServerId(s: string): number | null {
  if (!/^\d{1,9}$/.test(s)) return null;
  const n = Number(s);
  return isInt(n) && n > 0 ? n : null;
}
