// Reads a player's official profile (domain/armory.ts) through the Tauri HTTP plugin; the browser preview can't
// (the site sends no CORS headers). Gently: one request at a time, 1 s apart, each player at most every 10 minutes.
import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { infoUrl, parseInfo, pickCharacter, searchUrl, type Profile } from "../domain/armory.ts";

const KEEP_MS = 10 * 60_000, FAILED_MS = 60_000, GAP_MS = 1_000;
const cache = new Map<string, { at: number; p: Promise<Profile | null> }>();
let queue: Promise<unknown> = Promise.resolve();

async function getJson(url: string): Promise<any> {
  const run = queue.then(async () => {
    const res = await tauriFetch(url, { headers: { Accept: "application/json" } });
    // The site answers errors with an HTML page and status 200: only JSON counts.
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
  queue = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, GAP_MS)));
  return run;
}

/** The profile, or null when the player is not found; throws when the site can't be read (or outside the desktop app). */
export function officialProfile(name: string, serverId: number): Promise<Profile | null> {
  const key = `${serverId}|${name.trim()}`, kept = cache.get(key), now = Date.now();
  if (kept && now - kept.at < KEEP_MS) return kept.p;
  const p = (async () => {
    if (!isTauri()) throw new Error("only in the desktop app");
    const search = searchUrl(name, serverId);
    if (!search) return null;
    const id = pickCharacter(await getJson(search), name, serverId);
    return id ? parseInfo(await getJson(infoUrl(id, serverId)), Date.now()) : null;
  })();
  cache.set(key, { at: now, p });
  // A failure is retried after a minute, not ten.
  p.catch(() => cache.set(key, { at: now - KEEP_MS + FAILED_MS, p }));
  return p;
}
