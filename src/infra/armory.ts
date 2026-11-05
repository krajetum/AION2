// Reads the official character search and profiles (domain/armory.ts) through the app's Rust side (`armory_get`);
// the browser preview can't (the site sends no CORS headers). Gently: one request at a time, 1 s apart; a search is kept a minute,
// a profile 10 minutes, a failure a minute.
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  equipmentUrl, infoUrl, itemUrl, parseEquipment, parseInfo, parseItem, parseSearch, pickFound, searchUrl,
  type Equipment, type Found, type ItemDetail, type Piece, type Profile,
} from "../domain/armory.ts";

const SEARCH_MS = 60_000, PROFILE_MS = 10 * 60_000, FAILED_MS = 60_000, GAP_MS = 1_000;
const cache = new Map<string, { until: number; p: Promise<any> }>();
let queue: Promise<unknown> = Promise.resolve();

async function getJson(url: string): Promise<any> {
  if (!isTauri()) throw new Error("only in the desktop app");
  const run = queue.then(async () => {
    // From the Rust side (src-tauri/src/armory.rs): the HTTP plugin's Origin header gets a 403 from the search.
    const res = await invoke<{ status: number; json: boolean; body: string }>("armory_get", { url });
    // The site answers errors with an HTML page and status 200: only JSON counts.
    if (res.status < 200 || res.status >= 300 || !res.json) throw new Error(`HTTP ${res.status}`);
    return JSON.parse(res.body);
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

/** A character's equipment, arcana, pet, wings and skills, by the id the search gave. */
export function equipmentOf(characterId: string, serverId: number): Promise<Equipment | null> {
  return kept(`e|${serverId}|${characterId}`, PROFILE_MS, async () => parseEquipment(await getJson(equipmentUrl(characterId, serverId))));
}

/** A piece's details (stats, manastones, godstones, an arcana's skills and set). */
export function itemOf(p: Piece, characterId: string, serverId: number): Promise<ItemDetail | null> {
  return kept(`i|${serverId}|${characterId}|${p.slot}|${p.id}|${p.enchant + p.exceed}`, PROFILE_MS, async () => parseItem(await getJson(itemUrl(p, characterId, serverId))));
}
