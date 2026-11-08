// Cloudflare Worker: players' apps share the field-boss timers and hidden-cube openings they see.
// No player names, only a random install id, except in guilds (the members' character names, item level and CP,
// shared fights, by consent). The app works the same when this is down.
// API under /v1, backward-compatible changes only (an incompatible one = /v2 alongside).
import {
  alertKey, type BossTimer, callupPost, cellOf, CODE_LEN, dueAlerts, MAX_BODY, MAX_CALLUPS, MAX_LEAD, MAX_POSTS, nextDue, nextSend, normCode,
  parseAdmin, parseBossPost, parseCallup, parseCubePost, parseGuildCreate, parseGuildFight, parseJoin, parseMePost, parseServerId, type Ping, POSTED_FOR,
} from "./validate.ts";

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
      `INSERT INTO boss_maps (server_id, map_id, seen_ms, timers, install, next_due_ms) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (server_id, map_id) DO UPDATE SET seen_ms = excluded.seen_ms, timers = excluded.timers, install = excluded.install,
         next_due_ms = excluded.next_due_ms
       WHERE excluded.seen_ms > boss_maps.seen_ms`,
    ).bind(p.serverId, m.mapId, now, JSON.stringify(m.timers), p.install, nextDue(m.timers, now))));
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

// ---- Guilds ----
// A member is an install in guild_members (the install id is never shown); officer actions need the officer key.

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const MAX_FIGHTS_SHOWN = 100;
function randomCode(n = CODE_LEN): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => BASE32[b & 31]).join("");
}
async function hashOf(code: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const isMember = (env: Env, guildId: string, install: string | null) =>
  install ? env.DB.prepare("SELECT 1 AS ok FROM guild_members WHERE guild_id = ? AND install = ?").bind(guildId, install.toLowerCase()).first()
    : Promise.resolve(null);
const upsertMember = (env: Env, guildId: string, install: string, me: { name: string; className: string; itemLevel: number | null; combatPower: number | null },
  share: { gear: boolean; fights: boolean }, now: number) =>
  env.DB.prepare(
    `INSERT INTO guild_members (guild_id, install, name, class_name, item_level, combat_power, share_gear, share_fights, joined_ms, seen_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (guild_id, install) DO UPDATE SET name = excluded.name, class_name = excluded.class_name,
       item_level = excluded.item_level, combat_power = excluded.combat_power,
       share_gear = excluded.share_gear, share_fights = excluded.share_fights, seen_ms = excluded.seen_ms`,
  ).bind(guildId, install, me.name, me.className, me.itemLevel, me.combatPower, +share.gear, +share.fights, now, now);

/** A plain message (no mentions), or a whole webhook body (call-ups: embed and ping). */
async function postDiscord(webhook: string, message: string | object): Promise<boolean> {
  const body = typeof message === "string" ? { content: message, username: "AION 2 Companion", allowed_mentions: { parse: [] } } : message;
  try {
    const r = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return r.ok;
  } catch { return false; }
}

async function createGuild(env: Env, req: Request) {
  const now = Date.now();
  const p = parseGuildCreate(await readBody(req));
  if (!p) return fail(400, "bad request");
  if (!(await allowWrite(env, p.install, now))) return fail(429, "too many writes");
  const id = randomCode(12).toLowerCase();
  const memberCode = randomCode();
  const officerKey = randomCode();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO guilds (id, name, server_id, member_hash, officer_hash, created_ms) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, p.name, p.serverId, await hashOf(memberCode), await hashOf(officerKey), now),
    upsertMember(env, id, p.install, p.me, { gear: true, fights: false }, now),
  ]);
  return json({ id, name: p.name, serverId: p.serverId, memberCode, officerKey });
}

async function joinGuild(env: Env, req: Request) {
  const now = Date.now();
  const p = parseJoin(await readBody(req));
  if (!p) return fail(400, "bad request");
  if (!(await allowWrite(env, p.install, now))) return fail(429, "too many writes");
  const g = await env.DB.prepare("SELECT id, name, server_id FROM guilds WHERE member_hash = ?")
    .bind(await hashOf(p.code)).first<{ id: string; name: string; server_id: number }>();
  if (!g) return fail(404, "unknown code");
  await upsertMember(env, g.id, p.install, p.me, p.share, now).run();
  return json({ id: g.id, name: g.name, serverId: g.server_id });
}

async function getGuild(env: Env, url: URL, id: string) {
  const install = url.searchParams.get("install");
  if (!(await isMember(env, id, install))) return fail(403, "not a member");
  // The app asks with playing=1 while you play: that's what "online" is (one write per minute at most).
  const now = Date.now();
  if (url.searchParams.get("playing") === "1") {
    await env.DB.prepare("UPDATE guild_members SET seen_ms = ? WHERE guild_id = ? AND install = ? AND seen_ms < ?")
      .bind(now, id, install!.toLowerCase(), now - 60_000).run();
  }
  const g = await env.DB.prepare("SELECT name, server_id, lead_min, webhook IS NOT NULL AS hook FROM guilds WHERE id = ?")
    .bind(id).first<{ name: string; server_id: number; lead_min: number; hook: number }>();
  if (!g) return fail(403, "not a member");
  const { results } = await env.DB.prepare(
    `SELECT name, class_name, CASE WHEN share_gear THEN item_level END AS item_level,
       CASE WHEN share_gear THEN combat_power END AS combat_power, share_gear, share_fights, seen_ms
     FROM guild_members WHERE guild_id = ? ORDER BY name`,
  ).bind(id).all<{ name: string; class_name: string; item_level: number | null; combat_power: number | null; share_gear: number; share_fights: number; seen_ms: number }>();
  const callups = (await env.DB.prepare("SELECT id, at_ms, message, ping, leads FROM guild_callups WHERE guild_id = ? AND at_ms > ? ORDER BY at_ms")
    .bind(id, now - 3600_000).all<{ id: string; at_ms: number; message: string; ping: string; leads: string }>()).results
    .map((c) => ({ id: c.id, atMs: c.at_ms, message: c.message, ping: c.ping, leads: JSON.parse(c.leads) }));
  return json({
    serverNow: Date.now(), id, name: g.name, serverId: g.server_id, leadMin: g.lead_min, hasWebhook: !!g.hook, callups,
    members: results.map((m) => ({
      name: m.name, className: m.class_name, itemLevel: m.item_level, combatPower: m.combat_power,
      shareGear: !!m.share_gear, shareFights: !!m.share_fights, seenMs: m.seen_ms,
    })),
  });
}

async function postMe(env: Env, req: Request, id: string) {
  const now = Date.now();
  const p = parseMePost(await readBody(req));
  if (!p) return fail(400, "bad request");
  if (!(await isMember(env, id, p.install))) return fail(403, "not a member");
  if (!(await allowWrite(env, p.install, now))) return fail(429, "too many writes");
  if (p.leave) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM guild_members WHERE guild_id = ? AND install = ?").bind(id, p.install),
      env.DB.prepare("DELETE FROM guild_fights WHERE guild_id = ? AND install = ?").bind(id, p.install),
    ]);
  } else if (p.me) {
    await upsertMember(env, id, p.install, p.me, p.share, now).run();
  } else {
    await env.DB.prepare("UPDATE guild_members SET share_gear = ?, share_fights = ?, seen_ms = ? WHERE guild_id = ? AND install = ?")
      .bind(+p.share.gear, +p.share.fights, now, id, p.install).run();
  }
  return json({ ok: true });
}

async function postFight(env: Env, req: Request, id: string) {
  const now = Date.now();
  const p = parseGuildFight(await readBody(req));
  if (!p) return fail(400, "bad request");
  const m = await env.DB.prepare("SELECT share_fights FROM guild_members WHERE guild_id = ? AND install = ?")
    .bind(id, p.install).first<{ share_fights: number }>();
  if (!m) return fail(403, "not a member");
  if (!m.share_fights) return fail(403, "fights not shared");
  if (!(await allowWrite(env, p.install, now))) return fail(429, "too many writes");
  await env.DB.prepare(
    `INSERT OR REPLACE INTO guild_fights (guild_id, id, install, boss, end_ms, battle_ms, killed, record) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, p.id, p.install, p.boss, p.endMs, p.battleMs, +p.killed, p.record).run();
  return json({ ok: true });
}

/** No `boss`: the bosses with shared fights and how many. With `boss`: its last fights, from members still sharing fights. */
async function getFights(env: Env, url: URL, id: string) {
  if (!(await isMember(env, id, url.searchParams.get("install")))) return fail(403, "not a member");
  const boss = url.searchParams.get("boss");
  const shared = "JOIN guild_members m ON m.guild_id = f.guild_id AND m.install = f.install AND m.share_fights = 1";
  if (!boss) {
    const { results } = await env.DB.prepare(`SELECT f.boss AS boss, COUNT(*) AS n FROM guild_fights f ${shared} WHERE f.guild_id = ? GROUP BY f.boss ORDER BY n DESC`)
      .bind(id).all<{ boss: string; n: number }>();
    return json({ bosses: results });
  }
  const { results } = await env.DB.prepare(`SELECT f.record AS record FROM guild_fights f ${shared} WHERE f.guild_id = ? AND f.boss = ? ORDER BY f.end_ms DESC LIMIT ?`)
    .bind(id, boss.slice(0, 64), MAX_FIGHTS_SHOWN).all<{ record: string }>();
  return json({ fights: results.map((r) => JSON.parse(r.record)) });
}

async function postAdmin(env: Env, req: Request, id: string) {
  const now = Date.now();
  const p = parseAdmin(await readBody(req));
  if (!p) return fail(400, "bad request");
  const g = await env.DB.prepare("SELECT webhook FROM guilds WHERE id = ? AND officer_hash = ?")
    .bind(id, await hashOf(p.officerKey)).first<{ webhook: string | null }>();
  if (!g) return fail(403, "wrong officer key");
  if (!(await allowWrite(env, `officer:${id}`, now))) return fail(429, "too many writes");
  const stmts: D1PreparedStatement[] = [];
  let memberCode: string | undefined;
  if (p.webhook !== undefined) stmts.push(env.DB.prepare("UPDATE guilds SET webhook = ? WHERE id = ?").bind(p.webhook, id));
  if (p.leadMin !== undefined) stmts.push(env.DB.prepare("UPDATE guilds SET lead_min = ? WHERE id = ?").bind(p.leadMin, id));
  if (p.rotateCode) {
    memberCode = randomCode();
    stmts.push(env.DB.prepare("UPDATE guilds SET member_hash = ? WHERE id = ?").bind(await hashOf(memberCode), id));
  }
  if (p.remove) {
    stmts.push(
      env.DB.prepare("DELETE FROM guild_fights WHERE guild_id = ? AND install IN (SELECT install FROM guild_members WHERE guild_id = ? AND name = ?)")
        .bind(id, id, p.remove),
      env.DB.prepare("DELETE FROM guild_members WHERE guild_id = ? AND name = ?").bind(id, p.remove),
    );
  }
  if (stmts.length) await env.DB.batch(stmts);
  const hook = p.webhook !== undefined ? p.webhook : g.webhook;
  const tested = p.test ? (hook ? await postDiscord(hook, "Test from AION 2 Companion: boss alerts will be posted here.") : false) : undefined;
  return json({ ok: true, memberCode, tested });
}

/** Officer key → the guild row, or null. */
const officerGuild = async (env: Env, id: string, key: string) =>
  env.DB.prepare("SELECT id FROM guilds WHERE id = ? AND officer_hash = ?").bind(id, await hashOf(key)).first<{ id: string }>();

async function createCallup(env: Env, req: Request, id: string) {
  const now = Date.now();
  const p = parseCallup(await readBody(req), now);
  if (!p) return fail(400, "bad request");
  if (!(await officerGuild(env, id, p.officerKey))) return fail(403, "wrong officer key");
  if (!(await allowWrite(env, `officer:${id}`, now))) return fail(429, "too many writes");
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM guild_callups WHERE guild_id = ? AND at_ms > ?").bind(id, now).first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_CALLUPS) return fail(409, "too many call-ups");
  const cid = randomCode(12).toLowerCase();
  await env.DB.prepare("INSERT INTO guild_callups (id, guild_id, at_ms, message, ping, leads, next_ms, created_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    // The earliest reminder, even if already past: a call-up planned late gets one post at once (as members' apps do).
    .bind(cid, id, p.atMs, p.message, p.ping, JSON.stringify(p.leads), nextSend(p.atMs, p.leads, 0), now).run();
  return json({ id: cid });
}

async function cancelCallup(env: Env, req: Request, id: string, cid: string) {
  const b = await readBody(req) as { officerKey?: unknown } | undefined;
  const key = normCode(b?.officerKey);
  if (!key) return fail(400, "bad request");
  if (!(await officerGuild(env, id, key))) return fail(403, "wrong officer key");
  await env.DB.prepare("DELETE FROM guild_callups WHERE id = ? AND guild_id = ?").bind(cid, id).run();
  return json({ ok: true });
}

/** Call-ups with a reminder due: one post each (several reminders missed at once = one post), up to `max`. Returns posts used. */
async function callupAlerts(env: Env, now: number, max: number): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.at_ms, c.message, c.ping, c.leads, g.webhook FROM guild_callups c JOIN guilds g ON g.id = c.guild_id
     WHERE c.next_ms IS NOT NULL AND c.next_ms <= ? AND g.webhook IS NOT NULL ORDER BY c.next_ms LIMIT ?`,
  ).bind(now, max).all<{ id: string; at_ms: number; message: string; ping: Ping; leads: string; webhook: string }>();
  const stmts: D1PreparedStatement[] = [];
  for (const c of results) {
    // ponytail: a call-up whose time has passed with reminders left (cron down) still posts once, saying "x min ago".
    if (!(await postDiscord(c.webhook, callupPost({ atMs: c.at_ms, message: c.message, ping: c.ping })))) {
      // Retried every minute until its time; after that (webhook deleted?) it stops.
      if (c.at_ms < now) stmts.push(env.DB.prepare("UPDATE guild_callups SET next_ms = NULL WHERE id = ?").bind(c.id));
      continue;
    }
    stmts.push(env.DB.prepare("UPDATE guild_callups SET next_ms = ? WHERE id = ?").bind(nextSend(c.at_ms, JSON.parse(c.leads), now), c.id));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return results.length;
}

/** Every minute: call-up reminders, then Discord posts for the bosses due within each alerting guild's lead time. */
async function guildAlerts(env: Env, now: number): Promise<void> {
  const left = MAX_POSTS - await callupAlerts(env, now, MAX_POSTS);
  if (left <= 0) return;
  const guilds = (await env.DB.prepare("SELECT id, server_id, webhook, lead_min FROM guilds WHERE webhook IS NOT NULL")
    .all<{ id: string; server_id: number; webhook: string; lead_min: number }>()).results;
  if (!guilds.length) return;
  const servers = [...new Set(guilds.map((g) => g.server_id))];
  // Maps whose next respawn is due within MAX_LEAD, or passed (bumped to their next respawn below).
  const rows = (await env.DB.prepare(
    `SELECT server_id, map_id, timers, next_due_ms FROM boss_maps
     WHERE server_id IN (SELECT value FROM json_each(?)) AND next_due_ms IS NOT NULL AND next_due_ms <= ?`,
  ).bind(JSON.stringify(servers), now + MAX_LEAD * 60_000).all<{ server_id: number; map_id: number; timers: string; next_due_ms: number }>()).results;
  if (!rows.length) return;
  const maps = rows.map((r) => ({ serverId: r.server_id, mapId: r.map_id, timers: JSON.parse(r.timers) as BossTimer[], due: r.next_due_ms }));
  const posted = new Set((await env.DB.prepare(
    "SELECT guild_id, alert_key FROM guild_posts WHERE guild_id IN (SELECT value FROM json_each(?)) AND at_ms > ?",
  ).bind(JSON.stringify(guilds.map((g) => g.id)), now - POSTED_FOR).all<{ guild_id: string; alert_key: string }>()).results
    .map((p) => `${p.guild_id}|${p.alert_key}`));
  const alerts = dueAlerts(maps, guilds.map((g) => ({ id: g.id, serverId: g.server_id, webhook: g.webhook, leadMin: g.lead_min })), posted, now, left);
  const stmts: D1PreparedStatement[] = [];
  for (const a of alerts) {
    // ponytail: posted one after another; a Discord 429 just retries next minute (dedup row only after a success).
    if (!(await postDiscord(a.webhook, a.content))) continue;
    for (const k of a.keys) {
      stmts.push(env.DB.prepare("INSERT OR REPLACE INTO guild_posts (guild_id, alert_key, at_ms) VALUES (?, ?, ?)").bind(a.guildId, k, now));
    }
  }
  // A map whose earliest respawn passed: move it to its next one, so later bosses on it still alert.
  for (const m of maps) {
    if (m.due > now) continue;
    stmts.push(env.DB.prepare("UPDATE boss_maps SET next_due_ms = ? WHERE server_id = ? AND map_id = ?").bind(nextDue(m.timers, now), m.serverId, m.mapId));
  }
  if (stmts.length) await env.DB.batch(stmts);
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
      if (req.method === "POST" && url.pathname === "/v1/guilds") return await createGuild(env, req);
      if (req.method === "POST" && url.pathname === "/v1/guilds/join") return await joinGuild(env, req);
      const cancel = url.pathname.match(/^\/v1\/guilds\/([a-z2-7]{12})\/callups\/([a-z2-7]{12})\/delete$/);
      if (req.method === "POST" && cancel) return await cancelCallup(env, req, cancel[1], cancel[2]);
      const guild = url.pathname.match(/^\/v1\/guilds\/([a-z2-7]{12})(?:\/(me|fights|admin|callups))?$/);
      if (guild) {
        const [, id, part] = guild;
        if (req.method === "POST" && part === "callups") return await createCallup(env, req, id);
        if (req.method === "GET" && !part) return await getGuild(env, url, id);
        if (req.method === "GET" && part === "fights") return await getFights(env, url, id);
        if (req.method === "POST" && part === "me") return await postMe(env, req, id);
        if (req.method === "POST" && part === "fights") return await postFight(env, req, id);
        if (req.method === "POST" && part === "admin") return await postAdmin(env, req, id);
      }
      return fail(404, "not found");
    } catch (e) {
      console.error(e);
      return fail(500, "server error");
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = Date.now();
    if (event.cron === "* * * * *") {
      ctx.waitUntil(guildAlerts(env, now).catch((e) => console.error(e)));
      return;
    }
    ctx.waitUntil(env.DB.batch([
      env.DB.prepare("DELETE FROM boss_maps WHERE seen_ms < ?").bind(now - 7 * DAY),
      env.DB.prepare("DELETE FROM cube_reports WHERE at_ms < ?").bind(now - 30 * DAY),
      env.DB.prepare("DELETE FROM writes WHERE hour < ?").bind(Math.floor(now / HOUR) - 2),
      env.DB.prepare("DELETE FROM guild_posts WHERE at_ms < ?").bind(now - 2 * DAY),
      env.DB.prepare("DELETE FROM guild_fights WHERE end_ms < ?").bind(now - 90 * DAY),
      env.DB.prepare("DELETE FROM guild_members WHERE seen_ms < ?").bind(now - 60 * DAY),
      env.DB.prepare("DELETE FROM guilds WHERE id NOT IN (SELECT DISTINCT guild_id FROM guild_members)"),
      env.DB.prepare("DELETE FROM guild_callups WHERE at_ms < ? OR guild_id NOT IN (SELECT id FROM guilds)").bind(now - DAY),
    ]));
  },
};
