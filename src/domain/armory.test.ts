import { test } from "node:test";
import assert from "node:assert/strict";
import { infoUrl, parseInfo, pickCharacter, searchUrl } from "./armory.ts";

// What the official site sent on 2026-11-01 (trimmed).
const SEARCH = { list: [{ characterId: "RntUuGAWZ9jooU3ekF0p0R5IlD2DjrvdBiT1HIOVWfY%3D", name: "<strong>ImHopex</strong>", race: 2, pcId: 36, level: 45,
  serverId: 2318, serverName: "Baba", region: "eu" }], pagination: { page: 1, size: 30, total: 1, endPage: 1 } };
const INFO = { profile: { characterId: "RntUuGAWZ9jooU3ekF0p0R5IlD2DjrvdBiT1HIOVWfY=", characterLevel: 45, characterName: "ImHopex", className: "Chanter",
  combatPower: 146516, raceId: 2, serverId: 2318, serverName: "Baba" },
  stat: { statList: [{ name: "Might", type: "STR", value: 78 }, { name: "아이템레벨", type: "ItemLevel", value: 2803 }] } };

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
  assert.deepEqual(parseInfo(INFO, 5), { name: "ImHopex", className: "Chanter", level: 45, combatPower: 146516, itemLevel: 2803, atMs: 5 });
  assert.equal(parseInfo({ error: "x" }, 5), null);
});
