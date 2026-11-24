// Reads the official character search and profiles (domain/armory.ts) through the app's Rust side (`armory_get`);
// the browser preview can't (the site sends no CORS headers). Gently: at most 4 requests at once, started at least 150 ms
// apart (about what the official site does when it opens a profile); searches go before the queue of a profile's pieces
// and boards; a search is kept a minute (a failed one 5 s, after one retry), a profile 10 minutes, a failure a minute.
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  daevanionUrl, equipmentUrl, infoUrl, itemUrl, parseBoard, parseEquipment, parseInfo, parseItem, parseSearch, pickFound, searchUrl,
  type Board, type Equipment, type Found, type ItemDetail, type Piece, type Profile,
} from "../domain/armory.ts";
import { serversIn } from "../domain/servers.ts";

const SEARCH_MS = 60_000, PROFILE_MS = 10 * 60_000, FAILED_MS = 60_000, SEARCH_FAILED_MS = 5_000;
/** Requests in flight at once, and the least time between two starts. A request takes ~1 s to answer, so one at a time
 *  made a profile's ~25 pieces take half a minute (the player's video, 2026-11-06). */
const MAX_AT_ONCE = 4, START_GAP_MS = 150;
const cache = new Map<string, { until: number; p: Promise<any> }>();
let inFlight = 0, lastStart = 0;
/** Requests waiting for a slot: searches first. A search typed while a profile's ~25 pieces were being read waited
 *  behind all of them (the player: "the search is very slow", 2026-11-24). */
const waiting = { first: [] as (() => void)[], later: [] as (() => void)[] };

/** A slot to send a request: waits while 4 are in flight, then keeps starts START_GAP_MS apart. */
async function slot(first = false): Promise<() => void> {
  while (inFlight >= MAX_AT_ONCE) await new Promise<void>((r) => (first ? waiting.first : waiting.later).push(r));
  inFlight++;
  const wait = lastStart + START_GAP_MS - Date.now();
  lastStart = Math.max(Date.now(), lastStart + START_GAP_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return () => { inFlight--; (waiting.first.shift() ?? waiting.later.shift())?.(); };
}

async function getJson(url: string, first = false): Promise<any> {
  if (!isTauri()) throw new Error("only in the desktop app");
  const done = await slot(first);
  try {
    // From the Rust side (src-tauri/src/armory.rs): the HTTP plugin's Origin header gets a 403 from the search.
    const res = await invoke<{ status: number; json: boolean; body: string }>("armory_get", { url });
    // The site answers errors with an HTML page and status 200: only JSON counts.
    if (res.status < 200 || res.status >= 300 || !res.json) throw new Error(`HTTP ${res.status}`);
    return JSON.parse(res.body);
  } finally { done(); }
}

function kept<T>(key: string, keepMs: number, make: () => Promise<T>, failedMs = FAILED_MS): Promise<T> {
  const now = Date.now(), k = cache.get(key);
  if (k && now < k.until) return k.p;
  const p = make();
  cache.set(key, { until: now + keepMs, p });
  p.catch(() => cache.set(key, { until: Date.now() + failedMs, p }));
  return p;
}

/** Characters whose name contains `name` on that server. Throws when the site can't be read. */
export function searchPlayers(name: string, serverId: number): Promise<Found[]> {
  return kept(`s|${serverId}|${name.trim().toLowerCase()}`, SEARCH_MS, async () => {
    const url = searchUrl(name, serverId);
    if (!url) return [];
    // One retry: a server whose search failed once was left out of the region's results for a minute (the player
    // was "not found" on it).
    try { return parseSearch(await getJson(url, true)); } catch { await new Promise((r) => setTimeout(r, 400)); return parseSearch(await getJson(url, true)); }
  }, SEARCH_FAILED_MS);
}

/** Exact names first, then by level, then by name; one row per character. */
function ranked(list: Found[], name: string): Found[] {
  const n = name.trim().toLowerCase(), seen = new Set<string>();
  return list.filter((c) => !seen.has(c.characterId) && !!seen.add(c.characterId))
    .sort((a, b) => Number(b.name.toLowerCase() === n) - Number(a.name.toLowerCase() === n) || (b.level ?? 0) - (a.level ?? 0) || a.name.localeCompare(b.name));
}

/** A region search so far: the characters found, how many servers answered, failed, and were asked. */
export interface RegionSearch { found: Found[]; done: number; failed: number; total: number }

/**
 * Characters whose name contains `name` on every server of a region (`servers.ts` `serversIn`): the official search
 * asks for one server at a time, so one search per server (12 in Europe), before anything else in the 4-at-a-time
 * queue, each kept a minute. `onPart` gets the results as each server answers (the page shows them at once). Throws
 * only when no server could be read.
 */
export async function searchRegion(name: string, region: string, onPart?: (s: RegionSearch) => void): Promise<RegionSearch> {
  const servers = serversIn(region);
  const found: Found[] = [];
  let done = 0, failed = 0, firstError: unknown = null;
  const now = (): RegionSearch => ({ found: ranked(found, name), done, failed, total: servers.length });
  await Promise.all(servers.map((s) => searchPlayers(name, s.id).then(
    (list) => { found.push(...list); done++; onPart?.(now()); },
    (e) => { firstError ??= e; done++; failed++; onPart?.(now()); },
  )));
  if (failed && failed === servers.length) throw firstError;
  return now();
}

/** A character's profile, by the id the search gave. */
export function profileOf(characterId: string, serverId: number): Promise<Profile | null> {
  return kept(`p|${serverId}|${characterId}`, PROFILE_MS, async () => parseInfo(await getJson(infoUrl(characterId, serverId)), Date.now()));
}

/** The profile of exactly that name on that server, or null when not found. */
export async function officialProfile(name: string, serverId: number): Promise<Profile | null> {
  const hit = pickFound(await searchPlayers(name, serverId), name, serverId);
  return hit ? profileOf(hit.characterId, serverId) : null;
}

/** A character's equipment, arcana, pet, wings and skills, by the id the search gave. */
export function equipmentOf(characterId: string, serverId: number): Promise<Equipment | null> {
  return kept(`e|${serverId}|${characterId}`, PROFILE_MS, async () => parseEquipment(await getJson(equipmentUrl(characterId, serverId))));
}

/** A piece's details (stats, manastones, godstones, an arcana's skills and set). */
export function itemOf(p: Piece, characterId: string, serverId: number): Promise<ItemDetail | null> {
  return kept(`i|${serverId}|${characterId}|${p.slot}|${p.id}|${p.enchant + p.exceed}`, PROFILE_MS, async () => parseItem(await getJson(itemUrl(p, characterId, serverId))));
}

/** One Daevanion board's open nodes and what they give, by the profile's board id. */
export function boardOf(characterId: string, serverId: number, boardId: number): Promise<Board | null> {
  return kept(`d|${serverId}|${characterId}|${boardId}`, PROFILE_MS, async () => parseBoard(await getJson(daevanionUrl(characterId, serverId, boardId))));
}
