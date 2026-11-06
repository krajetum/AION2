// Cloudflare Worker: players' apps share the field-boss timers and hidden-cube openings they see.
// No player names, only a random install id. The app works the same when this is down.
// API under /v1, backward-compatible changes only (an incompatible one = /v2 alongside).
import { cellOf, MAX_BODY, parseBossPost, parseCubePost, parseServerId } from "./validate.ts";

// Minimal Workers types (no @cloudflare/workers-types).
interface D1Result<T> { results: T[] }
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<D1Result<T>>;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}
interface D1Database { prepare(query: string): D1PreparedStatement; batch(statements: D1PreparedStatement[]): Promise<unknown> }
interface ScheduledEvent { scheduledTime: number; cron: string }
interface ExecutionContext { waitUntil(p: Promise<unknown>): void }
declare global { interface CacheStorage { default: Cache } }
interface Env { DB: D1Database; POLL_SECONDS: string }

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const WRITES_PER_HOUR = 60;
const SPOT_INSTALLS = 3;
const CODE_INSTALLS = 2;
const BOSS_CACHE_S = 30;
const CUBE_CACHE_S = 3600;

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const fail = (status: number, error: string) => json({ error }, status);
const everyOf = (env: Env) => Number(env.POLL_SECONDS) || 120;

/** The body as JSON, or undefined when too big or not JSON. */
async function readBody(req: Request): Promise<unknown> {
  const buf = await req.arrayBuffer();
  if (buf.byteLength > MAX_BODY) return undefined;
  try { return JSON.parse(new TextDecoder().decode(buf)); } catch { return undefined; }
}

/** Counts a write; false once the install is over the hourly limit. */
async function allowWrite(env: Env, install: string, now: number): Promise<boolean> {
  const row = await env.DB.prepare(
    "INSERT INTO writes (install, hour, n) VALUES (?, ?, 1) ON CONFLICT (install, hour) DO UPDATE SET n = n + 1 RETURNING n",
  ).bind(install, Math.floor(now / HOUR)).first<{ n: number }>();
  return (row?.n ?? 0) <= WRITES_PER_HOUR;
}

/** Cached query result (without serverNow, which is always fresh: the client corrects its clock with it). */
async function cached<T>(key: string, seconds: number, load: () => Promise<T>): Promise<T> {
  const hit = await caches.default.match(key);
  if (hit) return hit.json() as Promise<T>;
  const value = await load();
  await caches.default.put(key, new Response(JSON.stringify(value), { headers: { "cache-control": `max-age=${seconds}` } }));
  return value;
}
const bossKey = (url: URL, serverId: number) => `${url.origin}/v1/bosses/${serverId}`;
const cubeKey = (url: URL) => `${url.origin}/v1/cubes`;

async function getBosses(env: Env, url: URL, serverId: number) {
  const maps = await cached(bossKey(url, serverId), BOSS_CACHE_S, async () => {
    const { results } = await env.DB.prepare("SELECT map_id, seen_ms, timers FROM boss_maps WHERE server_id = ?")
      .bind(serverId).all<{ map_id: number; seen_ms: number; timers: string }>();
    return results.map((r) => ({ mapId: r.map_id, seenMs: r.seen_ms, timers: JSON.parse(r.timers) }));
  });
  return json({ serverNow: Date.now(), every: everyOf(env), maps });
}

async function postBosses(env: Env, url: URL, req: Request) {
  const now = Date.now();
  const p = parseBossPost(await readBody(req), now);
  if (!p) return fail(400, "bad request");
  if (!(await allowWrite(env, p.install, now))) return fail(429, "too many writes");
  if (p.maps.length) {
    // Every timer is stamped seenMs = now, so the newest reading always wins.
    await env.DB.batch(p.maps.map((m) => env.DB.prepare(
      `INSERT INTO boss_maps (server_id, map_id, seen_ms, timers, install) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (server_id, map_id) DO UPDATE SET seen_ms = excluded.seen_ms, timers = excluded.timers, install = excluded.install
       WHERE excluded.seen_ms > boss_maps.seen_ms`,
    ).bind(p.serverId, m.mapId, now, JSON.stringify(m.timers), p.install)));
    await caches.default.delete(bossKey(url, p.serverId));
  }
  return json({ ok: true, every: everyOf(env) });
}

async function getCubes(env: Env, url: URL) {
  const data = await cached(cubeKey(url), CUBE_CACHE_S, async () => {
    // ponytail: MAX(code) picks one code per spot, a vote if installs ever disagree.
    const spots = await env.DB.prepare(
      `SELECT map_id AS mapId, AVG(x) AS x, AVG(y) AS y, AVG(z) AS z, MAX(code) AS code, COUNT(*) AS n
       FROM cube_reports GROUP BY map_id, cell HAVING COUNT(*) >= ?`,
    ).bind(SPOT_INSTALLS).all<{ mapId: number; x: number; y: number; z: number; code: number | null; n: number }>();
    const codes = await env.DB.prepare("SELECT code FROM cube_codes GROUP BY code HAVING COUNT(*) >= ?")
      .bind(CODE_INSTALLS).all<{ code: number }>();
    return { spots: spots.results, codes: codes.results.map((r) => r.code) };
  });
  return json({ serverNow: Date.now(), every: everyOf(env), ...data });
}

async function postCubes(env: Env, req: Request) {
  const now = Date.now();
  const p = parseCubePost(await readBody(req), now);
  if (!p) return fail(400, "bad request");
  if (!(await allowWrite(env, p.install, now))) return fail(429, "too many writes");
  const stmts = [
    ...p.cubes.map((c) => env.DB.prepare(
      `INSERT INTO cube_reports (map_id, cell, install, x, y, z, code, at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (map_id, cell, install) DO UPDATE SET x = excluded.x, y = excluded.y, z = excluded.z, code = excluded.code, at_ms = excluded.at_ms`,
    ).bind(p.mapId, cellOf(c.x, c.y), p.install, c.x, c.y, c.z, c.code, c.atMs)),
    ...p.codes.map((code) => env.DB.prepare("INSERT OR IGNORE INTO cube_codes (code, install) VALUES (?, ?)").bind(code, p.install)),
  ];
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, every: everyOf(env) });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    try {
      const boss = url.pathname.match(/^\/v1\/bosses\/([^/]+)$/);
      if (req.method === "GET" && boss) {
        const serverId = parseServerId(boss[1]);
        return serverId ? await getBosses(env, url, serverId) : fail(400, "bad server id");
      }
      if (req.method === "POST" && url.pathname === "/v1/bosses") return await postBosses(env, url, req);
      if (req.method === "GET" && url.pathname === "/v1/cubes") return await getCubes(env, url);
      if (req.method === "POST" && url.pathname === "/v1/cubes") return await postCubes(env, req);
      return fail(404, "not found");
    } catch (e) {
      console.error(e);
      return fail(500, "server error");
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = Date.now();
    ctx.waitUntil(env.DB.batch([
      env.DB.prepare("DELETE FROM boss_maps WHERE seen_ms < ?").bind(now - 7 * DAY),
      env.DB.prepare("DELETE FROM cube_reports WHERE at_ms < ?").bind(now - 30 * DAY),
      env.DB.prepare("DELETE FROM writes WHERE hour < ?").bind(Math.floor(now / HOUR) - 2),
    ]));
  },
};
