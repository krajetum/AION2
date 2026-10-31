import { test } from "node:test";
import assert from "node:assert/strict";
import { attempts, plan } from "./enhance.ts";

const near = (a: number, b: number, rel: number) => assert.ok(Math.abs(a - b) <= b * rel, `${a} vs ${b}`);

test("attempts: +5% per failure, a sure success at the end", () => {
  const p = attempts(65);
  assert.equal(p.length, 8); // metabot and gamewith: +10 → +11 guaranteed on attempt 8
  near(p.reduce((t, q) => t + q, 0), 1, 1e-9);
  assert.equal(attempts(20).length, 17);
  assert.deepEqual(attempts(100), [1]);
});

test("plan matches metabot's item level 102 Unique, +0 → +15", () => {
  const r = plan(102, 0, 15);
  near(r.kina, 14_986_721, 0.002);
  near(r.stones, 190_650, 0.002);
  near(r.unlucky, 21_520_400, 0.03); // theirs: 4,000 simulated runs
  assert.equal(r.steps.map((s) => s.max).join(), "1,1,1,1,1,1,1,1,1,1,8,11,14,16,17");
  assert.ok(r.lucky < r.typical && r.typical < r.unlucky && r.unlucky < r.worst);
});

test("plan scales with item level: metabot's totals for other Unique items within 1%", () => {
  for (const [lv, kina, stones] of [[36, 5_314_832, 67_328], [62, 9_119_150, 115_907], [94, 13_787_773, 175_717]]) {
    const r = plan(lv, 0, 15);
    near(r.kina, kina, 0.01);
    near(r.stones, stones, 0.01);
  }
});

test("plan: steps under +10 always succeed, stone price goes into the range", () => {
  const r = plan(102, 0, 10);
  assert.equal(r.attempts, 10);
  near(r.lucky, r.worst, 1e-4);
  assert.equal(plan(102, 14, 15, 10).worst, 17 * (1_860_000 + 14_820 * 10));
});
