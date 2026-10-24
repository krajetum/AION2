// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { faction, gearUrl, serverName } from "./servers.ts";

test("server ids: name, faction", () => {
  assert.equal(serverName(1304), "Kaisinel");
  assert.equal(faction(1304), "Elyos");
  assert.equal(faction(2313), "Asmodian");
  assert.equal(serverName(9999), "");
});

test("gear links follow ShuGo's profile URLs", () => {
  assert.equal(gearUrl("Munin Guy", 2313), "https://shugo.gg/character/global/eu-munin/Munin%20Guy");
  assert.equal(gearUrl("Seshoumaruu", 1401), "https://shugo.gg/character/global/la-siel/Seshoumaruu");
  assert.equal(gearUrl("X", 1203), "https://shugo.gg/character/global/naw-vaizel/X");
  assert.equal(gearUrl("", 1304), null);
  assert.equal(gearUrl("X", 9999), null);
});
