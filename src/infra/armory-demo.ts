// The Players page outside the desktop app (`npm run dev`): answers shaped like the official site's (domain/armory.ts
// parses them as it parses the real ones), for demo characters on the browser's demo meter profile's server
// (infra/meter.ts: "Demo Alt", 1304), so every tab can be checked in a browser. Never used in Tauri (infra/armory.ts).
import { SEARCH_URL, INFO_URL, EQUIPMENT_URL, ITEM_URL, DAEVANION_URL } from "../domain/armory.ts";
import { serverName } from "../domain/servers.ts";

export const DEMO_SERVER = 1304;
export const DEMO_NAMES = ["Demo Alt", "Demora", "Demo Broken"] as const;
/** Names the search finds whose profile fails (as Demo Broken's): enough for two pages of results. */
const SEARCH_ONLY = Array.from({ length: 7 }, (_, i) => `Demo ${i + 1}`);
const idOf = (name: string) => `demo-${name.toLowerCase().replace(/\s+/g, "-")}==`;

type Line = [name: string, value: string];
interface DemoPiece {
  slot: number; slotName: string; name: string; grade: string; enchant: number; exceed?: number;
  main: Line[]; sub: Line[]; skills?: [string, number][]; random?: boolean; added?: string;
}
interface DemoChar {
  className: string; level: number; cp: number; itemLevel: number; title: string;
  stats: [string, number, string[]][]; boards: [id: number, name: string, open: number, total: number, stats: string[], skills: string[]][];
  pieces: DemoPiece[]; active: [string, number][]; passive: [string, number][]; stigma: [string, number, boolean][];
  pet: [string, number] | null; wing: [string, string] | null;
}

const ALT: DemoChar = {
  className: "Gladiator", level: 45, cp: 51_000, itemLevel: 2040, title: "Demo profile",
  stats: [
    ["Might", 412, ["Attack +206", "Block +103"]], ["Precision", 388, ["Critical Hit +194"]], ["Dexterity", 301, ["Evasion +150"]],
    ["Constitution", 356, ["HP +3,560"]], ["Willpower", 240, ["MP +480"]], ["Mystic Resonance", 17, ["Demo stat no icon maps"]],
  ],
  boards: [
    [11, "Nezakan", 52, 80, ["Attack Bonus +30", "Critical Hit +45"], ["Overhead Slam +1"]],
    [12, "Zikel", 31, 80, ["Combat Speed +3%", "Multi-hit Chance +4,5%"], []],
    [13, "Vaizel", 0, 80, [], []],
  ],
  pieces: [
    { slot: 1, slotName: "MainHand", name: "Demo Greatsword", grade: "Unique", enchant: 15, exceed: 2, main: [["Attack", "412"]],
      sub: [["Combat Speed", "12.1%"], ["Might", "30"], ["Block", "120"], ["HP", "800"]], random: true },
    { slot: 4, slotName: "Torso", name: "Demo Breastplate", grade: "Unique", enchant: 12, main: [["Defense", "380"]],
      sub: [["Damage Boost", "6.1%"], ["Attack", "31"], ["MP", "420"], ["Evasion", "60"]], random: true },
    { slot: 7, slotName: "Gloves", name: "Demo Gauntlets", grade: "Legend", enchant: 10, main: [["Defense", "190"]],
      sub: [["Combat Speed", "2.1%"], ["Attack", "28"], ["Natural HP Regen", "40"]], random: true },
    { slot: 10, slotName: "Belt", name: "Demo Belt", grade: "Legend", enchant: 5, main: [["HP", "600"]], sub: [["Attack", "20"]], random: false },
    { slot: 11, slotName: "Necklace", name: "Demo Necklace", grade: "Unique", enchant: 10, main: [["Magic Defense", "150"]],
      sub: [["Combat Speed", "4.1%"], ["Might", "19"], ["Block", "90"], ["Natural MP Regen", "30"]], random: true },
    { slot: 14, slotName: "Ring1", name: "Demo Ring", grade: "Unique", enchant: 10, main: [["Attack", "60"]],
      sub: [["Might", "14"], ["Attack", "29"], ["Precision", "13"]], skills: [["Overhead Slam", 1]], random: true, added: "Precision" },
    { slot: 16, slotName: "Bracelet1", name: "Demo Bracelet", grade: "Unique", enchant: 8, main: [["Attack", "40"]],
      sub: [["Destruction [Zikel]", "16"], ["Wisdom [Lumiel]", "15"], ["Freedom [Vaizel]", "12"], ["Death [Triniel]", "11"]], random: true },
    { slot: 41, slotName: "Arcana1", name: "Demo Chalice", grade: "Unique", enchant: 5, main: [["Attack", "50"]], sub: [],
      skills: [["Overhead Slam", 4], ["Attack Preparation", 2], ["Keen Strike", 2], ["Leaping Slam", 1]] },
    { slot: 42, slotName: "Arcana2", name: "Demo Parchment", grade: "Legend", enchant: 3, main: [["Attack", "30"]], sub: [],
      skills: [["Overhead Slam", 2], ["Ruinous Blow", 1]] },
  ],
  active: [["Overhead Slam", 18], ["Ruinous Blow", 15], ["Attack Preparation", 21], ["Rending Blow", 12], ["Keen Strike", 9], ["Leaping Slam", 7]],
  passive: [["Experienced Counterstrike", 8], ["Impact Hit", 6], ["Murderous Burst", 5]],
  stigma: [["Demo Stigma Strike", 10, true], ["Demo Stigma Guard", 6, false], ["Demo Stigma Roar", 0, false]],
  pet: ["Demo Pet", 3], wing: ["Demo Wings", "Legend"],
};

const DEMORA: DemoChar = {
  ...ALT, level: 44, cp: 42_000, itemLevel: 1880, title: "Demo profile",
  stats: ALT.stats.slice(0, 5).map(([n, v, e]) => [n, Math.round(v * 0.85), e]),
  boards: [[11, "Nezakan", 40, 80, ["Attack Bonus +20"], []], [12, "Zikel", 12, 80, ["Combat Speed +1%"], []]],
  pieces: ALT.pieces.filter((p) => !["Bracelet1", "Arcana2"].includes(p.slotName))
    .map((p) => ({ ...p, name: p.name.replace("Demo", "Demora's"), enchant: Math.max(0, p.enchant - 3), exceed: 0 })),
  active: ALT.active.map(([n, l]) => [n, Math.max(1, l - 3)]),
  pet: null,
};

const CHARS: Record<string, DemoChar> = { [idOf("Demo Alt")]: ALT, [idOf("Demora")]: DEMORA };

const charOf = (q: URLSearchParams) => {
  const c = Number(q.get("serverId")) === DEMO_SERVER ? CHARS[q.get("characterId") ?? ""] : undefined;
  if (!c) throw new Error("no demo answer");
  return c;
};
const nameOf = (id: string) => [...DEMO_NAMES, ...SEARCH_ONLY].find((n) => idOf(n) === id) ?? "";

function search(q: URLSearchParams) {
  if (Number(q.get("serverId")) !== DEMO_SERVER) return { list: [] };
  const t = (q.get("keyword") ?? "").trim().toLowerCase();
  return { list: [...DEMO_NAMES, ...SEARCH_ONLY].filter((n) => t && n.toLowerCase().includes(t)).map((n, i) => ({
    characterId: encodeURIComponent(idOf(n)), name: n, level: n === "Demo Alt" ? ALT.level : n === "Demora" ? DEMORA.level : 40 - i,
    serverId: DEMO_SERVER, serverName: serverName(DEMO_SERVER),
  })) };
}

function info(q: URLSearchParams) {
  const c = charOf(q);
  return {
    profile: { characterName: nameOf(q.get("characterId") ?? ""), className: c.className, characterLevel: c.level, combatPower: c.cp,
      serverName: serverName(DEMO_SERVER), raceName: "Elyos", titleName: c.title },
    stat: { statList: [{ type: "ItemLevel", name: "Item Level", value: c.itemLevel },
      ...c.stats.map(([name, value, effects]) => ({ type: name, name, value, statSecondList: effects }))] },
    daevanion: { boardList: c.boards.map(([id, name, open, total]) => ({ id, name, openNodeCount: open, totalNodeCount: total })) },
  };
}

function equipment(q: URLSearchParams) {
  const c = charOf(q);
  const skill = (category: string) => ([name, level, equip]: [string, number, boolean?], i: number) =>
    ({ id: 1000 * (category.length + 1) + i, name, icon: "", skillLevel: level, category, equip: equip ? 1 : 0 });
  return {
    equipment: { equipmentList: c.pieces.map((p) => ({ id: 9_000_000 + p.slot, name: p.name, grade: p.grade, icon: "",
      enchantLevel: p.enchant, exceedLevel: p.exceed ?? 0, slotPos: p.slot, slotPosName: p.slotName })) },
    skill: { skillList: [...c.active.map(skill("Active")), ...c.passive.map(skill("Passive")), ...c.stigma.map(skill("Dp"))] },
    petwing: { pet: c.pet ? { name: c.pet[0], level: c.pet[1], icon: "" } : null, wing: c.wing ? { name: c.wing[0], grade: c.wing[1], icon: "" } : null },
  };
}

function item(q: URLSearchParams) {
  const p = charOf(q).pieces.find((x) => x.slot === Number(q.get("slotPos")));
  if (!p) throw new Error("no demo answer");
  const id = (n: string) => n.toLowerCase().replace(/\W+/g, "_");
  return {
    name: p.name, grade: p.grade, categoryName: p.slotName.startsWith("Arcana") ? "Arcana" : "Equipment", level: 102, maxEnchantLevel: 15,
    mainStats: p.main.map(([name, value]) => ({ id: id(name), name, value, extra: p.enchant ? String(p.enchant * 4) : "", exceed: false })),
    subStats: p.sub.map(([name, value]) => ({ id: id(name), name, value, added: name === p.added })),
    magicStoneStat: [], godStoneStat: [],
    subSkills: (p.skills ?? []).map(([name, level]) => ({ name, level })),
    subStatRandom: !!p.random, set: null,
  };
}

function board(q: URLSearchParams) {
  const b = charOf(q).boards.find((x) => x[0] === Number(q.get("boardId")));
  if (!b) throw new Error("no demo answer");
  const [, , open, total, stats, skills] = b;
  return {
    nodeList: Array.from({ length: total }, (_, i) => ({ type: "Stat", open: i < open ? 1 : 0 })),
    openStatEffectList: stats.map((desc) => ({ desc })), openSkillEffectList: skills.map((desc) => ({ desc })),
  };
}

/** The site's answer to an official URL for the demo characters; throws "no demo answer" for anything else. */
export function demoJson(url: string): unknown {
  const u = new URL(url), base = `${u.origin}${u.pathname}`, q = u.searchParams;
  if (base === SEARCH_URL) return search(q);
  if (base === INFO_URL) return info(q);
  if (base === EQUIPMENT_URL) return equipment(q);
  if (base === ITEM_URL) return item(q);
  if (base === DAEVANION_URL) return board(q);
  throw new Error("no demo answer");
}
