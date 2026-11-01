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

/** The official profile page of a character (the site's own link). */
export const profilePage = (characterId: string, serverId: number) =>
  `https://aion2.plaync.com/en-us/characters/${serverId}/${encodeURIComponent(characterId)}`;

export const EQUIPMENT_URL = "https://aion2.plaync.com/api/character/equipment";
export const equipmentUrl = (characterId: string, serverId: number) =>
  `${EQUIPMENT_URL}?region=${regionOf(serverId)}&lang=en-US&characterId=${encodeURIComponent(characterId)}&serverId=${serverId}`;

/** An equipped piece: `enchant` (+n) and `exceed` (the site's diamond: levels past the enchant cap). */
export interface Piece { id: number; name: string; grade: string; icon: string; enchant: number; exceed: number; slot: number; slotName: string }
/** level 0 = not learned yet (the site shows a lock). */
export interface Skill { id: number; name: string; icon: string; level: number; equipped: boolean }
export interface Equipment {
  gear: Piece[];        // weapons, armour, cloak, belt (the site's first Gear tab)
  accessories: Piece[]; // necklace, earrings, rings, bracelets, amulet, runes (its second tab)
  arcana: Piece[];      // Arcana1-5
  pet: { name: string; level: number | null; icon: string } | null;
  wing: { name: string; grade: string; icon: string } | null;
  active: Skill[]; passive: Skill[]; stigma: Skill[]; // stigma = the site's "Dp" skills; `equipped` = its "E"
}

const ACCESSORY = /^(Necklace|Earring|Ring|Bracelet|Amulet|Rune)/;
const str = (v: unknown) => (typeof v === "string" ? v : "");

function piece(x: any): Piece | null {
  if (!x || typeof x.id !== "number" || typeof x.name !== "string") return null;
  return { id: x.id, name: plain(x.name), grade: str(x.grade), icon: str(x.icon), enchant: num(x.enchantLevel) ?? 0, exceed: num(x.exceedLevel) ?? 0,
    slot: num(x.slotPos) ?? 0, slotName: str(x.slotPosName) };
}

/** The equipment answer: pieces by tab (in slot order), arcana, pet and wings, skills by kind. Null when it is not one. */
export function parseEquipment(json: any): Equipment | null {
  const list: any[] | undefined = json?.equipment?.equipmentList;
  if (!Array.isArray(list)) return null;
  const pieces = list.map(piece).filter((p): p is Piece => !!p).sort((a, b) => a.slot - b.slot);
  const skills: any[] = Array.isArray(json?.skill?.skillList) ? json.skill.skillList : [];
  const kind = (c: string) => skills.filter((s) => s?.category === c && typeof s.name === "string")
    .map((s): Skill => ({ id: num(s.id) ?? 0, name: plain(s.name), icon: str(s.icon), level: num(s.skillLevel) ?? 0, equipped: s.equip === 1 }));
  const pet = json?.petwing?.pet, wing = json?.petwing?.wing;
  return {
    gear: pieces.filter((p) => !p.slotName.startsWith("Arcana") && !ACCESSORY.test(p.slotName)),
    accessories: pieces.filter((p) => ACCESSORY.test(p.slotName)),
    arcana: pieces.filter((p) => p.slotName.startsWith("Arcana")),
    pet: pet && typeof pet.name === "string" ? { name: plain(pet.name), level: num(pet.level), icon: str(pet.icon) } : null,
    wing: wing && typeof wing.name === "string" ? { name: plain(wing.name), grade: str(wing.grade), icon: str(wing.icon) } : null,
    active: kind("Active"), passive: kind("Passive"), stigma: kind("Dp"),
  };
}

export const ITEM_URL = "https://aion2.plaync.com/api/character/equipment/item";
/** A piece's details. The site asks with the enchant and exceed levels added up (+15 and 3 → enchantLevel=18). */
export const itemUrl = (p: Piece, characterId: string, serverId: number) =>
  `${ITEM_URL}?id=${p.id}&enchantLevel=${p.enchant + p.exceed}&characterId=${encodeURIComponent(characterId)}&serverId=${serverId}&slotPos=${p.slot}&lang=en-US&region=${regionOf(serverId)}`;

export interface ItemDetail {
  name: string; grade: string; category: string; level: number | null; maxEnchant: number | null;
  main: { name: string; value: string; extra: string; exceed: boolean }[]; // value + extra (the enchant's); exceed = from the levels past the cap
  sub: { name: string; value: string }[];
  manastones: { name: string; value: string; grade: string }[];
  godstones: { name: string; desc: string; grade: string }[];
  skills: { name: string; level: number | null }[]; // an arcana's skill levels
  set: { name: string; equipped: number; bonuses: { pieces: number; text: string[] }[] } | null;
}

/** A piece's details answer. Null when it is not one. */
export function parseItem(json: any): ItemDetail | null {
  if (!json || typeof json.name !== "string") return null;
  const arr = (v: unknown): any[] => (Array.isArray(v) ? v.filter(Boolean) : []);
  const set = json.set;
  return {
    name: plain(json.name), grade: str(json.grade), category: plain(json.categoryName), level: num(json.level), maxEnchant: num(json.maxEnchantLevel),
    main: arr(json.mainStats).map((s) => ({ name: plain(s.name), value: str(s.value), extra: str(s.extra), exceed: s.exceed === true })),
    sub: arr(json.subStats).map((s) => ({ name: plain(s.name), value: str(s.value) })),
    manastones: arr(json.magicStoneStat).map((s) => ({ name: plain(s.name), value: str(s.value), grade: str(s.grade) })),
    godstones: arr(json.godStoneStat).map((s) => ({ name: plain(s.name), desc: str(s.desc), grade: str(s.grade) })),
    skills: arr(json.subSkills).map((s) => ({ name: plain(s.name), level: num(s.level) })),
    set: set && typeof set.name === "string" ? { name: plain(set.name), equipped: num(set.equippedCount) ?? 0,
      bonuses: arr(set.bonuses).map((b) => ({ pieces: num(b.degree) ?? 0, text: arr(b.descriptions).map(str) })) } : null,
  };
}
