import { test } from "node:test";
import assert from "node:assert/strict";
import { equipmentUrl, infoUrl, itemUrl, parseEquipment, parseInfo, parseItem, parseSearch, pickCharacter, profilePage, searchUrl } from "./armory.ts";

// What the official site sent on 2026-11-01 (trimmed).
const SEARCH = { list: [{ characterId: "RntUuGAWZ9jooU3ekF0p0R5IlD2DjrvdBiT1HIOVWfY%3D", name: "<strong>ImHopex</strong>", race: 2, pcId: 36, level: 45,
  serverId: 2318, serverName: "Baba", region: "eu" }], pagination: { page: 1, size: 30, total: 1, endPage: 1 } };
const INFO = { profile: { characterId: "RntUuGAWZ9jooU3ekF0p0R5IlD2DjrvdBiT1HIOVWfY=", characterLevel: 45, characterName: "ImHopex", className: "Chanter",
  combatPower: 146516, raceId: 2, serverId: 2318, serverName: "Baba" },
  stat: { statList: [{ name: "Might", statSecondList: ["Attack increase +7.8%"], type: "STR", value: 78 },
    { name: "Willpower", statSecondList: null, type: "WIS", value: 0 }, { name: "아이템레벨", statSecondList: null, type: "ItemLevel", value: 2803 }] },
  daevanion: { boardList: [{ id: 81, name: "Nezekan", open: 1, openNodeCount: 63, openPercent: 72, totalNodeCount: 88 }] } };

test("official profile: the site's own URLs", () => {
  assert.equal(searchUrl("ImHopex", 2318),
    "https://api-search.plaync.com/aion2global/search/v2/character?keyword=ImHopex&race=2&serverId=2318&page=1&size=30&region=eu&localeInfo=en-US");
  const id = pickCharacter(SEARCH, "ImHopex", 2318)!;
  assert.equal(infoUrl(id, 2318),
    "https://aion2.plaync.com/api/character/info?region=eu&lang=en-US&characterId=RntUuGAWZ9jooU3ekF0p0R5IlD2DjrvdBiT1HIOVWfY%3D&serverId=2318");
  assert.equal(searchUrl("", 2318), null);
  assert.equal(searchUrl("ImHopex", 0), null);
});

test("official profile: only that name on that server", () => {
  assert.equal(pickCharacter(SEARCH, "ImHope", 2318), null);
  assert.equal(pickCharacter(SEARCH, "ImHopex", 2018), null);
  assert.ok(pickCharacter(SEARCH, "imhopex", 2318));
  assert.equal(pickCharacter({}, "ImHopex", 2318), null);
});

test("official profile: level, class, item level, combat power", () => {
  const p = parseInfo(INFO, 5)!;
  assert.deepEqual({ ...p, stats: undefined, boards: undefined },
    { name: "ImHopex", className: "Chanter", level: 45, combatPower: 146516, itemLevel: 2803, atMs: 5, serverName: "Baba", raceName: "", title: "", stats: undefined, boards: undefined });
  assert.deepEqual(p.stats, [{ name: "Might", value: 78, effects: ["Attack increase +7.8%"] }, { name: "Willpower", value: 0, effects: [] }]);
  assert.deepEqual(p.boards, [{ name: "Nezekan", open: 63, total: 88 }]);
  assert.equal(parseInfo({ error: "x" }, 5), null);
});

test("official search: every character found, names without the marks", () => {
  assert.deepEqual(parseSearch(SEARCH), [{ characterId: "RntUuGAWZ9jooU3ekF0p0R5IlD2DjrvdBiT1HIOVWfY=", name: "ImHopex", level: 45, serverId: 2318, serverName: "Baba" }]);
  assert.deepEqual(parseSearch({ list: [{ name: "x" }] }), []);
});

// The equipment answer the site sent on 2026-11-01, trimmed: 4 pieces, pet and wings, 6 skills.
const EQUIPMENT = {"equipment": {"equipmentList": [{"enchantLevel": 15, "exceedLevel": 3, "grade": "Unique", "icon": "https://assets.playnccdn.com/static-aion2-gamedata/resources/Icon_WP_ST_0041_T06.png", "id": 110830051, "name": "Enraged Kromede Rod", "slotPos": 1, "slotPosName": "MainHand"}, {"enchantLevel": 11, "exceedLevel": 0, "grade": "Unique", "icon": "https://assets.playnccdn.com/static-aion2-gamedata/resources/Icon_Equip_AR_L_Idris_01_Helmet.png", "id": 210330053, "name": "Nuakum Helm", "slotPos": 3, "slotPosName": "Helmet"}, {"enchantLevel": 14, "exceedLevel": 0, "grade": "Unique", "icon": "https://assets.playnccdn.com/static-aion2-gamedata/resources/Icon_ACC_Ring_0053.png", "id": 310330053, "name": "Enraged Kromede Ring", "slotPos": 13, "slotPosName": "Ring1"}, {"enchantLevel": 4, "exceedLevel": 0, "grade": "Unique", "icon": "https://assets.playnccdn.com/static-aion2-gamedata/resources/Icon_Arcana_Card_Parchment_u_PveSet2.png", "id": 810230001, "name": "Parchment of Vigor", "slotPos": 42, "slotPosName": "Arcana2"}], "skinList": []}, "petwing": {"pet": {"icon": "https://assets.playnccdn.com/static-aion2-gamedata/resources/UT_Vehicle_Portrait_WindEle_02.png", "id": 1094, "level": 3, "name": "Intermediate Wind Spirit"}, "wing": {"enchantLevel": 0, "grade": "Unique", "icon": "https://assets.playnccdn.com/static-aion2-gamedata/resources/Icon_WingA_011.png", "id": 40101100, "name": "Talisra Wings"}, "wingSkin": {"enchantLevel": 0, "grade": "Unique", "icon": "https://assets.playnccdn.com/static-aion2-gamedata/resources/Icon_WingA_011.png", "id": 40101100, "name": "Talisra Wings"}}, "skill": {"skillList": [{"acquired": 1, "category": "Active", "equip": 1, "icon": "https://assets.playnccdn.com/static-aion2-gamedata/resources/ICON_CH_SKILL_001.png", "id": 18010000, "name": "Onslaught", "needLevel": 1, "skillLevel": 15}, {"acquired": 1, "category": "Active", "equip": 0, "icon": "https://assets.playnccdn.com/static-aion2-gamedata/resources/ICON_CO_SKILL_002.png", "id": 18200000, "name": "Defiance", "needLevel": 16, "skillLevel": 11}, {"acquired": 1, "category": "Passive", "equip": 0, "icon": "https://assets.playnccdn.com/static-aion2-gamedata/resources/ICON_CH_SKILL_Passive_012.png", "id": 18710000, "name": "Blessing of Life", "needLevel": 1, "skillLevel": 16}, {"acquired": 1, "category": "Dp", "equip": 1, "icon": "https://assets.playnccdn.com/static-aion2-gamedata/resources/ICON_CH_SKILL_019.png", "id": 18190000, "name": "Undefeated Mantra", "needLevel": 22, "skillLevel": 15}, {"acquired": 1, "category": "Dp", "equip": 0, "icon": "https://assets.playnccdn.com/static-aion2-gamedata/resources/ICON_CH_SKILL_022.png", "id": 18220000, "name": "Obliterate", "needLevel": 22, "skillLevel": 0}, {"acquired": 0, "category": "Dp", "equip": 0, "icon": "https://assets.playnccdn.com/static-aion2-gamedata/resources/ICON_CH_SKILL_044.png", "id": 18440000, "name": "Barrier Spell", "needLevel": 22, "skillLevel": 0}]}};
// A piece's details as the site sent them (Nuakum Helm, trimmed).
const ITEM = { id: 210330053, name: "Nuakum Helm", grade: "Unique", categoryName: "Helm", level: 86, enchantLevel: 11, maxEnchantLevel: 15,
  mainStats: [{ id: "ArmorDefense", name: "Defense", value: "477", extra: "275", exceed: false }],
  subStats: [{ id: "HardHit", name: "Double Chance", value: "1.9%" }],
  magicStoneStat: [{ id: "Critical", value: "+15", name: "Critical Hit", grade: "Unique", slotPos: 2 }] };
const ARCANA = { id: 810230001, name: "Parchment of Vigor", grade: "Unique", categoryName: "Parchment", level: 80, maxEnchantLevel: 5,
  mainStats: [{ id: "Life", name: "Life [Yustiel]", value: "20", extra: "4", exceed: false }],
  subSkills: [{ id: 18150000, level: 3, name: "Heat Wave Blow" }],
  set: { name: "Primal Vigor", equippedCount: 3, bonuses: [{ degree: 2, descriptions: ["+60 PvE Attack when HP is 70% or more"] }] } };

test("official equipment: tabs, arcana, pet, wings, skills", () => {
  const id = "RntUuGAWZ9jooU3ekF0p0R5IlD2DjrvdBiT1HIOVWfY=";
  assert.equal(equipmentUrl(id, 2318), "https://aion2.plaync.com/api/character/equipment?region=eu&lang=en-US&characterId=RntUuGAWZ9jooU3ekF0p0R5IlD2DjrvdBiT1HIOVWfY%3D&serverId=2318");
  assert.equal(profilePage(id, 2318), "https://aion2.plaync.com/en-us/characters/2318/RntUuGAWZ9jooU3ekF0p0R5IlD2DjrvdBiT1HIOVWfY%3D");
  const e = parseEquipment(EQUIPMENT)!;
  assert.deepEqual(e.gear.map((p) => [p.name, p.enchant, p.exceed]), [["Enraged Kromede Rod", 15, 3], ["Nuakum Helm", 11, 0]]);
  assert.deepEqual(e.accessories.map((p) => p.slotName), ["Ring1"]);
  assert.deepEqual(e.arcana.map((p) => [p.name, p.enchant]), [["Parchment of Vigor", 4]]);
  assert.deepEqual([e.pet?.name, e.pet?.level, e.wing?.name], ["Intermediate Wind Spirit", 3, "Talisra Wings"]);
  assert.deepEqual(e.active.map((s) => [s.name, s.level, s.equipped]), [["Onslaught", 15, true], ["Defiance", 11, false]]);
  assert.deepEqual(e.passive.map((s) => s.name), ["Blessing of Life"]);
  assert.deepEqual(e.stigma.map((s) => [s.name, s.level, s.equipped]), [["Undefeated Mantra", 15, true], ["Obliterate", 0, false], ["Barrier Spell", 0, false]]);
  // The site asked for the rod's details with enchantLevel=18 (+15, exceed 3).
  assert.equal(itemUrl(e.gear[0], id, 2318),
    "https://aion2.plaync.com/api/character/equipment/item?id=110830051&enchantLevel=18&characterId=RntUuGAWZ9jooU3ekF0p0R5IlD2DjrvdBiT1HIOVWfY%3D&serverId=2318&slotPos=1&lang=en-US&region=eu");
  assert.equal(parseEquipment({}), null);
});

test("official item details: stats, manastones, an arcana's skills and set", () => {
  const h = parseItem(ITEM)!;
  assert.deepEqual(h.main, [{ name: "Defense", value: "477", extra: "275", exceed: false }]);
  assert.deepEqual(h.sub, [{ name: "Double Chance", value: "1.9%" }]);
  assert.deepEqual(h.manastones, [{ name: "Critical Hit", value: "+15", grade: "Unique" }]);
  assert.equal(h.set, null);
  const a = parseItem(ARCANA)!;
  assert.deepEqual(a.skills, [{ name: "Heat Wave Blow", level: 3 }]);
  assert.deepEqual(a.set, { name: "Primal Vigor", equipped: 3, bonuses: [{ pieces: 2, text: ["+60 PvE Attack when HP is 70% or more"] }] });
  assert.equal(parseItem(null), null);
});
