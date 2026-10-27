// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanWallets, takeOdyle, takeWallet, walletOf, walletRows, type Wallet } from "./wallet.ts";

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
