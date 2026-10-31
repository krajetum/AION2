// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanWallets, takeOdyle, takeWallet, walletOf, walletRows, pickWallet, takeApGains, apSince, type Wallet } from "./wallet.ts";

test("the meter's currencies go on their character; older news does not replace newer", () => {
  const all: Record<string, Wallet> = {};
  // 2026-10-27 12:47: Abyss Points after a shop, Kina after another.
  assert.equal(takeWallet(all, { owner: "Randronirk", values: { "930100003": 225_824 }, atMs: 10 }), true);
  assert.equal(takeWallet(all, { owner: "Randronirk", values: { "930100003": 225_824, "930100031": 5_061_092 }, atMs: 20 }), true);
  assert.deepEqual(all.Randronirk.values, { "930100003": 225_824, "930100031": 5_061_092 });
  assert.equal(takeWallet(all, { owner: "Randronirk", values: { "930100003": 225_824, "930100031": 5_061_092 }, atMs: 20 }), false, "the same again");
  assert.equal(takeWallet(all, { owner: "Randronirk", values: { "930100031": 1 }, atMs: 5 }), false, "older");
  assert.equal(takeWallet(all, { owner: null, values: { "930100031": 1 }, atMs: 30 }), false, "no character yet");
  assert.equal(walletOf(all, "randronirk"), all.Randronirk);
});

test("Odyle energy is kept per character; wallets survive a save", () => {
  const all: Record<string, Wallet> = {};
  assert.equal(takeOdyle(all, { basic: 120, charged: 30, owner: "Kiizu" }, 1), true);
  assert.equal(takeOdyle(all, { basic: 120, charged: 30, owner: "Kiizu" }, 2), false);
  assert.equal(takeOdyle(all, { basic: 120, charged: 30, owner: null }, 2), false);
  assert.deepEqual(cleanWallets(JSON.parse(JSON.stringify(all))), all);
  assert.deepEqual(cleanWallets({ "": { values: {}, atMs: 1 }, Bad: { values: { a: "x" }, atMs: 1 } }), { Bad: { values: {}, atMs: 1 } });
});

test("Kina and bound Kina apart, or as one total", () => {
  const w: Wallet = { values: { "930100031": 5_061_092, "930100001": 19_000, "930100003": 225_824 }, atMs: 1 };
  assert.deepEqual(walletRows(w, false), [{ name: "Kina", value: 5_061_092 }, { name: "Bound Kina", value: 19_000 }, { name: "Abyss Points", value: 225_824 }]);
  assert.deepEqual(walletRows(w, true), [{ name: "Kina (all)", value: 5_080_092 }, { name: "Abyss Points", value: 225_824 }]);
});

test("the sidebar's wallet: the selected character's, else the one played in game, else the only one", () => {
  const w = (n: number): Wallet => ({ values: { "930100031": n }, atMs: 1 });
  const all = { Randronirk: w(1), Kiizu: w(2) };
  assert.equal(pickWallet(all, "Kiizu", "Randronirk")?.name, "Kiizu");
  assert.equal(pickWallet(all, "Main", "randronirk")?.name, "Randronirk", "the app's character named otherwise");
  assert.equal(pickWallet(all, "Main", undefined), undefined, "two kept, none chosen: none");
  assert.equal(pickWallet({ Randronirk: w(1) }, "Main", undefined)?.name, "Randronirk");
  assert.equal(pickWallet({}, "Main", "Randronirk"), undefined);
});

test("AP gains: once each, once settled, by source and map; today's split", () => {
  const all: Record<string, Wallet> = {};
  const w = { owner: "Randronirk", values: {}, atMs: 1, apGains: [
    { amount: 120, mapId: 20, atMs: 100_000 },   // a PvP kill at 102 s, read late
    { amount: 29, mapId: 20, atMs: 200_000 },    // 1 s after a mob kill of yours
    { amount: 500, mapId: 20, atMs: 300_000 },   // nothing near: a quest
    { amount: 40, mapId: 1110, atMs: 400_000 },  // an assist at home
    { amount: 7, mapId: 20, atMs: 405_000 },     // too new: waits
  ] };
  const pvp = [{ atMs: 102_000, kind: "kill" }, { atMs: 399_000, kind: "assist" }, { atMs: 300_500, kind: "death" }];
  const loots = [{ atMs: 199_000 }];
  assert.equal(takeApGains(all, w, pvp, loots, 410_000), true);
  assert.deepEqual(all.Randronirk.apGains!.map((g) => [g.amount, g.abyss, g.from]),
    [[120, true, "players"], [29, true, "mobs"], [500, true, "other"], [40, false, "players"]]);
  assert.equal(takeApGains(all, w, pvp, loots, 410_000), false, "the meter resends them: once");
  takeApGains(all, w, pvp, loots, 420_000);
  assert.equal(all.Randronirk.apGains!.length, 5, "settled now");
  const t = apSince(all.Randronirk, 150_000);
  assert.deepEqual([t.total, t.abyss, t.elsewhere], [576, { players: 0, mobs: 29, other: 507 }, { players: 40, mobs: 0, other: 0 }]);
  assert.deepEqual(cleanWallets(JSON.parse(JSON.stringify(all))).Randronirk.apGains, all.Randronirk.apGains);
});

test("AP from a player your party killed, without a hit of yours, counts as players (2026-10-31)", () => {
  const all: Record<string, Wallet> = {};
  const w = { owner: "Me", values: {}, atMs: 1, apGains: [{ amount: 60, mapId: 20, atMs: 100_000 }, { amount: 500, mapId: 20, atMs: 200_000 }] };
  takeApGains(all, w, [], [], 300_000, [98_500]);
  assert.deepEqual(all.Me.apGains!.map((g) => g.from), ["players", "other"]);
});
