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

/** The earliest respawn still to come on a map (a boss not up, time known and after `now`), or null. */
export function nextDue(timers: BossTimer[], now: number): number | null {
  let best: number | null = null;
  for (const t of timers) if (!t.up && t.timeMs > now && (best === null || t.timeMs < best)) best = t.timeMs;
  return best;
}

// ---- Guilds ----

export const MAX_GUILD_NAME = 32;
export const MAX_FIGHT = 8 * 1024; // one fight record, JSON
export const MAX_ROWS = 24;
export const MAX_LEAD = 15; // minutes; the cron reads the maps due within this
/** A guild code / officer key: 16 characters of base32 (A-Z, 2-7), dashes and spaces ignored. */
export const CODE_LEN = 16;
/** Discord posts per cron run: the free plan allows 50 subrequests per invocation. */
export const MAX_POSTS = 40;
/** A boss alerted once isn't alerted again for this long (its next respawn is hours away). */
export const POSTED_FOR = 30 * 60_000;

export interface Me { name: string; className: string; itemLevel: number | null; combatPower: number | null }
export interface Share { gear: boolean; fights: boolean }
export interface GuildCreate { install: string; name: string; serverId: number; me: Me }
export interface GuildJoin { install: string; code: string; me: Me; share: Share }
export interface MePost { install: string; leave: boolean; me: Me | null; share: Share }
export interface GuildFight { install: string; id: string; boss: string; endMs: number; battleMs: number; killed: boolean; record: string }
export interface GuildAdmin {
  officerKey: string; webhook?: string | null; leadMin?: number; remove?: string; rotateCode: boolean; test: boolean;
}

const isInstall = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const count = (v: unknown) => (isNum(v) && v >= 0 && v < 1e12 ? Math.round(v) : null);

/** A code as typed (any case, dashes, spaces) → its canonical form, or null. */
export function normCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.toUpperCase().replace(/[\s-]/g, "");
  return s.length === CODE_LEN && /^[A-Z2-7]+$/.test(s) ? s : null;
}

/** Discord webhooks only: the Worker must not post to any URL a player sends. */
export function isWebhook(v: unknown): v is string {
  return typeof v === "string" && /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d{1,25}\/[\w-]{1,100}$/.test(v);
}

export function parseMe(v: unknown): Me | null {
  if (!isObj(v)) return null;
  const name = text(v.name, MAX_NAME);
  if (!name) return null;
  return { name, className: text(v.className, MAX_NAME), itemLevel: count(v.itemLevel), combatPower: count(v.combatPower) };
}

/** Consent: gear on unless turned off (it's public on the official site anyway), fights only when turned on. */
export function parseShare(v: unknown): Share {
  return { gear: !(isObj(v) && v.gear === false), fights: isObj(v) && v.fights === true };
}

export function parseGuildCreate(body: unknown): GuildCreate | null {
  if (!isObj(body) || !isInstall(body.install) || !isId(body.serverId)) return null;
  const name = text(body.name, MAX_GUILD_NAME);
  const me = parseMe(body.me);
  return name && me ? { install: body.install.toLowerCase(), name, serverId: body.serverId, me } : null;
}

export function parseJoin(body: unknown): GuildJoin | null {
  if (!isObj(body) || !isInstall(body.install)) return null;
  const code = normCode(body.code);
  const me = parseMe(body.me);
  return code && me ? { install: body.install.toLowerCase(), code, me, share: parseShare(body.share) } : null;
}

export function parseMePost(body: unknown): MePost | null {
  if (!isObj(body) || !isInstall(body.install)) return null;
  const leave = body.leave === true;
  const me = body.me === undefined ? null : parseMe(body.me);
  if (!leave && body.me !== undefined && !me) return null;
  return { install: body.install.toLowerCase(), leave, me, share: parseShare(body.share) };
}

/** One fight (the app's FightRecord, trimmed): kept as the JSON sent once its fields check out. */
export function parseGuildFight(body: unknown): GuildFight | null {
  if (!isObj(body) || !isInstall(body.install) || !isObj(body.fight)) return null;
  const f = body.fight;
  const id = text(f.id, MAX_NAME);
  const boss = text(f.boss, MAX_NAME);
  if (!id || !boss || !isNum(f.endMs) || f.endMs <= 0 || !isNum(f.battleTimeMs) || f.battleTimeMs <= 0
    || typeof f.killed !== "boolean" || !Array.isArray(f.rows) || f.rows.length > MAX_ROWS || !f.rows.every(isObj)) return null;
  const record = JSON.stringify(f);
  if (record.length > MAX_FIGHT) return null;
  return { install: body.install.toLowerCase(), id, boss, endMs: f.endMs, battleMs: f.battleTimeMs, killed: f.killed, record };
}

/** Officer actions. `webhook: ""` or null removes it; anything else must be a Discord webhook. */
export function parseAdmin(body: unknown): GuildAdmin | null {
  if (!isObj(body)) return null;
  const officerKey = normCode(body.officerKey);
  if (!officerKey) return null;
  const a: GuildAdmin = { officerKey, rotateCode: body.rotateCode === true, test: body.test === true };
  if (body.webhook !== undefined) {
    if (body.webhook === null || body.webhook === "") a.webhook = null;
    else if (isWebhook(body.webhook)) a.webhook = body.webhook;
    else return null;
  }
  if (body.leadMin !== undefined) {
    if (!isInt(body.leadMin) || body.leadMin < 1 || body.leadMin > MAX_LEAD) return null;
    a.leadMin = body.leadMin;
  }
  if (body.remove !== undefined) {
    const name = text(body.remove, MAX_NAME);
    if (!name) return null;
    a.remove = name;
  }
  return a;
}

export interface DueMap { serverId: number; mapId: number; timers: BossTimer[] }
export interface AlertGuild { id: string; serverId: number; webhook: string; leadMin: number }
export interface Alert { guildId: string; webhook: string; keys: string[]; content: string }

/** The key of a boss in `guild_posts`. */
export const alertKey = (t: BossTimer) => `${t.mapId}:${t.bossId}`;

/**
 * One Discord message per guild with the bosses respawning within its lead time, skipping the ones in `posted`
 * (`guildId|key`, alerted within POSTED_FOR). At most MAX_POSTS messages; the rest go out on the next run.
 */
export function dueAlerts(maps: DueMap[], guilds: AlertGuild[], posted: Set<string>, now: number): Alert[] {
  const out: Alert[] = [];
  for (const g of guilds) {
    if (out.length >= MAX_POSTS) break;
    const due = maps.filter((m) => m.serverId === g.serverId).flatMap((m) => m.timers)
      .filter((t) => !t.up && t.timeMs > now && t.timeMs - now <= g.leadMin * 60_000 && !posted.has(`${g.id}|${alertKey(t)}`))
      .sort((a, b) => a.timeMs - b.timeMs);
    if (!due.length) continue;
    const lines = due.map((t) => {
      const s = Math.round(t.timeMs / 1000);
      return `**${(t.name || `Boss ${t.bossId}`).replace(/[*_`~|<>@]/g, "")}** respawns <t:${s}:R> (<t:${s}:t>)`;
    });
    out.push({ guildId: g.id, webhook: g.webhook, keys: due.map(alertKey), content: lines.join("\n").slice(0, 2000) });
  }
  return out;
}

/** The serverId of GET /v1/bosses/:serverId, or null. */
export function parseServerId(s: string): number | null {
  if (!/^\d{1,9}$/.test(s)) return null;
  const n = Number(s);
  return isInt(n) && n > 0 ? n : null;
}
