// A player's official profile (level, class, item level, combat power) from the public character search and profile
// that NCSOFT's AION 2 site uses (aion2.plaync.com, "Characters"). Not a documented API: the URLs and fields below are the
// ones the site requested on 2026-11-01 (EU, an Asmodian on Baba 2318); they may change without notice. Pure.
import { faction, regionOf } from "./servers.ts";

export const SEARCH_URL = "https://api-search.plaync.com/aion2global/search/v2/character";
export const INFO_URL = "https://aion2.plaync.com/api/character/info";

export interface Profile { name: string; className: string; level: number | null; itemLevel: number | null; combatPower: number | null; atMs: number }

/** `race`: 2 = Asmodian (seen); 1 = Elyos is inferred, not seen yet. */
export const raceOf = (serverId: number) => (faction(serverId) === "Asmodian" ? 2 : faction(serverId) === "Elyos" ? 1 : 0);

/** The search for a name on a server; null without a name, a faction or a region. Only "eu" was seen; the other regions use shugo.gg's codes. */
export function searchUrl(name: string, serverId: number): string | null {
  const n = name.trim(), race = raceOf(serverId), region = regionOf(serverId);
  if (!n || !race || !region) return null;
  return `${SEARCH_URL}?keyword=${encodeURIComponent(n)}&race=${race}&serverId=${serverId}&page=1&size=30&region=${region}&localeInfo=en-US`;
}

const plain = (s: unknown) => (typeof s === "string" ? s.replace(/<[^>]*>/g, "").trim() : "");

/** The character id of exactly that name on that server (the search matches parts of names and marks them with <strong>). */
export function pickCharacter(json: any, name: string, serverId: number): string | null {
  const list: any[] = Array.isArray(json?.list) ? json.list : [];
  const here = list.filter((c) => c && c.serverId === serverId && typeof c.characterId === "string");
  const hit = here.find((c) => plain(c.name) === name.trim()) ?? here.find((c) => plain(c.name).toLowerCase() === name.trim().toLowerCase());
  if (!hit) return null;
  // The search sends the id URL-encoded ("…%3D"), the profile plain ("…="): decoded here, encoded once in infoUrl.
  try { return decodeURIComponent(hit.characterId); } catch { return hit.characterId; }
}

export function infoUrl(characterId: string, serverId: number): string {
  return `${INFO_URL}?region=${regionOf(serverId)}&lang=en-US&characterId=${encodeURIComponent(characterId)}&serverId=${serverId}`;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The profile's header and its item level (a stat of type "ItemLevel"). Null when it is not a profile. */
export function parseInfo(json: any, now: number): Profile | null {
  const p = json?.profile;
  if (!p || typeof p.characterName !== "string") return null;
  const stats: any[] = Array.isArray(json?.stat?.statList) ? json.stat.statList : [];
  return {
    name: p.characterName, className: plain(p.className), level: num(p.characterLevel), combatPower: num(p.combatPower),
    itemLevel: num(stats.find((s) => s?.type === "ItemLevel")?.value), atMs: now,
  };
}
