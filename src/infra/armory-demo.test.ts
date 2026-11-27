import { test } from "node:test";
import assert from "node:assert/strict";
import { daevanionUrl, equipmentUrl, infoUrl, itemUrl, parseBoard, parseEquipment, parseInfo, parseItem, parseSearch, searchUrl } from "../domain/armory.ts";
import { DEMO_SERVER, demoJson } from "./armory-demo.ts";

const open = (name: string) => parseSearch(demoJson(searchUrl(name, DEMO_SERVER)!)).find((c) => c.name === name)!;

test("demo JSON parses", () => {
  const found = parseSearch(demoJson(searchUrl("demo", DEMO_SERVER)!));
  assert.equal(found.length, 10);
  for (const name of ["Demo Alt", "Demora"]) {
    const c = open(name);
    const p = parseInfo(demoJson(infoUrl(c.characterId, c.serverId)), 0)!;
    assert.equal(p.name, name);
    assert.ok(p.itemLevel && p.boards?.length);
    const eq = parseEquipment(demoJson(equipmentUrl(c.characterId, c.serverId)))!;
    assert.ok(eq.gear.length && eq.accessories.length && eq.arcana.length && eq.active.length);
    for (const piece of [...eq.gear, ...eq.accessories, ...eq.arcana]) assert.ok(parseItem(demoJson(itemUrl(piece, c.characterId, c.serverId))), piece.name);
    for (const b of p.boards!) assert.ok(parseBoard(demoJson(daevanionUrl(c.characterId, c.serverId, b.id))), b.name);
  }
});

test("other servers answer an empty search", () => {
  assert.deepEqual(parseSearch(demoJson(searchUrl("demo", 1301)!)), []);
});

test("Demo Broken's info throws", () => {
  const c = open("Demo Broken");
  assert.throws(() => demoJson(infoUrl(c.characterId, c.serverId)), /no demo answer/);
  assert.throws(() => demoJson("https://example.com/x"), /no demo answer/);
});
