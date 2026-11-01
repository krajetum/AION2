// Reads the official character search and profiles (domain/armory.ts) through the Tauri HTTP plugin; the browser
// preview can't (the site sends no CORS headers). Gently: one request at a time, 1 s apart; a search is kept a minute,
// a profile 10 minutes, a failure a minute.
import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { infoUrl, parseInfo, parseSearch, pickFound, searchUrl, type Found, type Profile } from "../domain/armory.ts";

const SEARCH_MS = 60_000, PROFILE_MS = 10 * 60_000, FAILED_MS = 60_000, GAP_MS = 1_000;
const cache = new Map<string, { until: number; p: Promise<any> }>();
let queue: Promise<unknown> = Promise.resolve();

async function getJson(url: string): Promise<any> {
  if (!isTauri()) throw new Error("only in the desktop app");
  const run = queue.then(async () => {
    const res = await tauriFetch(url, { headers: { Accept: "application/json" } });
    // The site answers errors with an HTML page and status 200: only JSON counts.
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
  queue = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, GAP_MS)));
  return run;
}

function kept<T>(key: string, keepMs: number, make: () => Promise<T>): Promise<T> {
  const now = Date.now(), k = cache.get(key);
  if (k && now < k.until) return k.p;
  const p = make();
  cache.set(key, { until: now + keepMs, p });
  p.catch(() => cache.set(key, { until: now + FAILED_MS, p }));
  return p;
}

/** Characters whose name contains `name` on that server. Throws when the site can't be read. */
export function searchPlayers(name: string, serverId: number): Promise<Found[]> {
  return kept(`s|${serverId}|${name.trim().toLowerCase()}`, SEARCH_MS, async () => {
    const url = searchUrl(name, serverId);
    return url ? parseSearch(await getJson(url)) : [];
  });
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
