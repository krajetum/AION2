import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanMarket, DAY, KEEP_DAYS, latestReads, parsePrices, sparkline, takeReads, type MarketData } from "./market.ts";

const NOW = 20_000 * DAY + 5_000;
const r = (code: number, price: number, atMs = NOW) => ({ code, price, atMs });

test("takeReads: lowest of the day, idempotent, old days pruned", () => {
  const m: MarketData = { 9: [{ day: 20_000 - KEEP_DAYS - 1, price: 1 }] };
  assert.deepEqual(takeReads(m, [r(5, 900), r(5, 700), r(5, 800), r(6, 0), r(7, 50, NOW - DAY)], NOW), [{ code: 5, price: 700 }, { code: 7, price: 50 }]);
  assert.deepEqual(m, { 5: [{ day: 20_000, price: 700 }], 7: [{ day: 19_999, price: 50 }] });
  assert.deepEqual(takeReads(m, [r(5, 900), r(5, 700)], NOW), []);
  takeReads(m, [r(7, 60)], NOW);
  assert.deepEqual(m[7], [{ day: 19_999, price: 50 }, { day: 20_000, price: 60 }]);
});

test("latestReads: newest read per code", () => {
  const got = latestReads([r(5, 9, 2), r(5, 7, 3), r(5, 8, 1), r(6, 1, 1)]);
  assert.deepEqual([...got.values()].map((x) => [x.code, x.price]), [[5, 7], [6, 1]]);
});

test("cleanMarket / parsePrices drop malformed points", () => {
  assert.deepEqual(cleanMarket({ 5: [{ day: 2, price: 3 }, { day: 1, price: 4 }, { day: -1, price: 1 }], x: [], 6: "no" }), { 5: [{ day: 1, price: 4 }, { day: 2, price: 3 }] });
  assert.deepEqual(cleanMarket(null), {});
  assert.deepEqual(parsePrices({ items: { 5: [{ day: 1, price: 4, n: 2 }, { day: 2, price: 3 }] } }), { 5: [{ day: 1, price: 4, n: 2 }] });
  assert.deepEqual(parsePrices("x"), {});
});

test("sparkline: needs 2 points, scaled to the box", () => {
  assert.equal(sparkline([{ day: 10, price: 5 }], 10, 30, 60, 20), "");
  assert.equal(sparkline([{ day: 9, price: 10 }, { day: 10, price: 20 }], 10, 2, 60, 20), "M0.0,20.0 L60.0,0.0");
});
