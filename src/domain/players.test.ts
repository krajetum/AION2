import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanRecent, pageOf, pageWith, pushRecent, sameCharacter } from "./players.ts";

const c = (n: number, server = 1304) => ({ characterId: `id${n}`, name: `Name${n}`, level: 40, serverId: server, serverName: "Kaisinel" });
const list = Array.from({ length: 10 }, (_, i) => i);

test("pageOf clamps", () => {
  assert.deepEqual(pageOf(list, 1), { items: [6, 7, 8, 9], page: 1, pages: 2, from: 7, to: 10 });
  assert.equal(pageOf(list, 5).page, 1);
  assert.equal(pageOf(list, -1).page, 0);
  assert.deepEqual(pageOf([], 0), { items: [], page: 0, pages: 1, from: 0, to: 0 });
});

test("pageWith finds the hit's page", () => {
  const found = Array.from({ length: 10 }, (_, i) => c(i));
  const hit = { ...found[7] }; // a copy, as a $state proxy would be
  assert.equal(pageWith(found, (x) => sameCharacter(x, hit)), 1);
  assert.equal(pageWith(found, () => false), 0);
});

test("pushRecent dedupes and caps", () => {
  let r = [c(1), c(2), c(3), c(4), c(5)];
  r = pushRecent(r, { ...c(3), name: "NAME3" });
  assert.deepEqual(r.map((x) => x.characterId), ["id3", "id1", "id2", "id4", "id5"]);
  r = pushRecent(r, c(6));
  assert.deepEqual(r.map((x) => x.characterId), ["id6", "id3", "id1", "id2", "id4"]);
  assert.equal(pushRecent(r, c(6, 1305)).length, 5); // same id on another server = another character
  assert.equal(pushRecent(r, c(6, 1305))[1].serverId, 1304);
});

test("cleanRecent drops bad entries", () => {
  assert.deepEqual(cleanRecent(null), []);
  assert.deepEqual(cleanRecent("x"), []);
  const good = c(1);
  assert.deepEqual(cleanRecent([good, { name: "x" }, null, { ...c(2), serverId: "1304" }]), [good]);
  assert.equal(cleanRecent(Array.from({ length: 9 }, (_, i) => c(i))).length, 5);
});
