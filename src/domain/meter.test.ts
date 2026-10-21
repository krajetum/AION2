// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { clock, hpLeft, short } from "./meter.ts";

test("short numbers", () => {
  assert.equal(short(950), "950");
  assert.equal(short(9_999), "9,999");
  assert.equal(short(12_345), "12.3K");
  assert.equal(short(4_560_000), "4.56M");
  assert.equal(short(2_500_000_000), "2.50B");
});

test("fight clock", () => {
  assert.equal(clock(0), "0:00");
  assert.equal(clock(65_400), "1:05");
  assert.equal(clock(-5), "0:00");
});

test("HP left: live HP wins, else max minus damage, clamped", () => {
  const t = { name: "", isBoss: true, maxHp: 1000, currentHp: -1, damageDealt: 250 };
  assert.equal(hpLeft(t), 0.75);
  assert.equal(hpLeft({ ...t, currentHp: 100 }), 0.1);
  assert.equal(hpLeft({ ...t, damageDealt: 5000 }), 0);
  assert.equal(hpLeft({ ...t, maxHp: 0 }), undefined);
});
