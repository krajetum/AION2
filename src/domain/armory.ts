// A player's official profile (level, class, item level, combat power) from the public character search and profile
// that NCSOFT's AION 2 site uses (aion2.plaync.com, "Characters"). Not a documented API: the URLs and fields below are the
// ones the site requested on 2026-11-01 (EU, an Asmodian on Baba 2318); they may change without notice. Pure.
import { faction, regionOf } from "./servers.ts";

export const SEARCH_URL = "https://api-search.plaync.com/aion2global/search/v2/character";
export const INFO_URL = "https://aion2.plaync.com/api/character/info";

export interface Profile {
  name: string; className: string; level: number | null; itemLevel: number | null; combatPower: number | null; atMs: number;
  serverName?: string; raceName?: string; title?: string;
  stats?: { name: string; value: number; effects: string[] }[]; // primary and god stats, item level left out
  boards?: { name: string; open: number; total: number }[];     // Daevanion boards: nodes open of total
}

/** `race`: 2 = Asmodian (seen); 1 = Elyos is inferred, not seen yet. */
export const raceOf = (serverId: number) => (faction(serverId) === "Asmodian" ? 2 : faction(serverId) === "Elyos" ? 1 : 0);

/** The search for a name on a server; null without a name, a faction or a region. Only "eu" was seen; the other regions use shugo.gg's codes. */
export function searchUrl(name: string, serverId: number): string | null {
  const n = name.trim(), race = raceOf(serverId), region = regionOf(serverId);
  if (!n || !race || !region) return null;
  return `${SEARCH_URL}?keyword=${encodeURIComponent(n)}&race=${race}&serverId=${serverId}&page=1&size=30&region=${region}&localeInfo=en-US`;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const plain = (s: unknown) => (typeof s === "string" ? s.replace(/<[^>]*>/g, "").trim() : "");

/** A character the search found. */
export interface Found { characterId: string; name: string; level: number | null; serverId: number; serverName: string }

/** The search's characters (it matches parts of names and marks them with <strong>, removed here). */
export function parseSearch(json: any): Found[] {
  const list: any[] = Array.isArray(json?.list) ? json.list : [];
  return list.filter((c) => c && typeof c.characterId === "string" && typeof c.serverId === "number").map((c) => {
    // The search sends the id URL-encoded ("…%3D"), the profile plain ("…="): decoded here, encoded once in infoUrl.
    let id = c.characterId;
    try { id = decodeURIComponent(id); } catch { /* kept as sent */ }
    return { characterId: id, name: plain(c.name), level: num(c.level), serverId: c.serverId, serverName: plain(c.serverName) };
  });
}

/** Exactly that name on that server, among what the search found. */
export function pickFound(found: Found[], name: string, serverId: number): Found | null {
  const here = found.filter((c) => c.serverId === serverId), n = name.trim();
  return here.find((c) => c.name === n) ?? here.find((c) => c.name.toLowerCase() === n.toLowerCase()) ?? null;
}

/** The character id of exactly that name on that server, from the search's answer. */
export const pickCharacter = (json: any, name: string, serverId: number) => pickFound(parseSearch(json), name, serverId)?.characterId ?? null;

export function infoUrl(characterId: string, serverId: number): string {
  return `${INFO_URL}?region=${regionOf(serverId)}&lang=en-US&characterId=${encodeURIComponent(characterId)}&serverId=${serverId}`;
}

/** The profile's header and its item level (a stat of type "ItemLevel"). Null when it is not a profile. */
export function parseInfo(json: any, now: number): Profile | null {
  const p = json?.profile;
  if (!p || typeof p.characterName !== "string") return null;
  const stats: any[] = Array.isArray(json?.stat?.statList) ? json.stat.statList : [];
  return {
    name: p.characterName, className: plain(p.className), level: num(p.characterLevel), combatPower: num(p.combatPower),
    itemLevel: num(stats.find((s) => s?.type === "ItemLevel")?.value), atMs: now,
    serverName: plain(p.serverName), raceName: plain(p.raceName), title: plain(p.titleName),
    stats: stats.filter((s) => s && s.type !== "ItemLevel" && typeof s.name === "string" && num(s.value) != null)
      .map((s) => ({ name: plain(s.name), value: s.value, effects: Array.isArray(s.statSecondList) ? s.statSecondList.map(plain) : [] })),
    boards: (Array.isArray(json?.daevanion?.boardList) ? json.daevanion.boardList : [])
      .filter((b: any) => b && typeof b.name === "string" && num(b.openNodeCount) != null && num(b.totalNodeCount) != null)
      .map((b: any) => ({ name: plain(b.name), open: b.openNodeCount, total: b.totalNodeCount })),
  };
}
