// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ResetConfig } from "../config.ts";
import { claimedOf, seasonSummary, SEASONAL, stepCoins, weekLeft, WEEKLY, weeksLeft } from "./season.ts";
import { emptySeason } from "./season.ts";

const C: ResetConfig = {
  timeZone: "UTC",
  daily: { hour: 7, minute: 0 },
  weekly: { weekday: 3, hour: 7, minute: 0 },
  monthly: { day: 1, hour: 7, minute: 0 },
  cloudMerchantMinute: 0,
};

test("summary matches the sheet (2026-10-20)", () => {
  const claimed = {
    "Street Fighter (50→500 kill)": 1250, "Artifact Assault": 1500, "Coins to Make Me Shine": 1800,
    "Wandering Wraith of the Floating Island": 1120, "No Time to Rest": 1000, "Peering into the Abyss": 700,
    "All I Have Is Two Wings": 2020, "Scars of Glory": 560, "Missed by a Hair": 700, "I Don't Fear Death": 420,
    "Deus Research Base Stage 1": 250, "Deus Research Base Stage 2": 500, "Shattered Arkanis Stage 1": 1460,
    "Shattered Arkanis Stage 2": 500, "Tower of Trials": 2850, "Hand-to-Hand Combat": 1380,
    "Tribulation of Aponos": 700, "Tribulation of Duduri and Dodori": 700,
  };
  const weeks = weeksLeft(Date.parse("2026-10-20T12:00:00Z"), C, "2026-12-16");
  assert.equal(weeks, 8);
  const s = seasonSummary({ coins: 79710, thisWeek: 4200, claimed, hardPvp: {}, excluded: {} }, weeks);
  assert.equal(s.weeklyCoins, 33300);
  assert.equal(s.weeklyAp, 48230);
  assert.equal(s.futureWeekly, 266400);
  assert.equal(s.seasonalRemaining, 175820);
  assert.equal(s.totalObtainable, 446420);
  assert.equal(s.maxAtEnd, 526130);
  assert.equal(s.hardPvpRemaining, 30680);
  assert.equal(s.realistic, 415740);
  assert.equal(s.realisticEnd, 495450);
  assert.deepEqual(s.tabs.find((t) => t.tab === "Nightmare"), { tab: "Nightmare", weekly: 3060, total: 67450, remaining: 67450 });
});

test("step coins: all = total, none = 0, partial = estimate", () => {
  assert.deepEqual(stepCoins(16700, 5, 5), { coins: 16700, exact: true });
  assert.deepEqual(stepCoins(16700, 5, 0), { coins: 0, exact: true });
  assert.deepEqual(stepCoins(16700, 5, 2), { coins: 6680, exact: false });
});

test("claimed: all steps exact, typed amount beats an estimate", () => {
  const m = SEASONAL[0], s = emptySeason();
  s.steps = { [m.name]: m.steps };
  assert.deepEqual(claimedOf(m, s), { coins: m.coins, exact: true });
  s.steps = { [m.name]: 1 }; s.claimed[m.name] = 1250;
  assert.deepEqual(claimedOf(m, s), { coins: 1250, exact: true });
  delete s.claimed[m.name];
  assert.equal(claimedOf(m, s).exact, false);
});

test("week left: ticked steps this week, a new week starts over", () => {
  const s = emptySeason(), wk = 1000, full = WEEKLY.reduce((a, m) => a + m.coins, 0);
  assert.equal(weekLeft(s, wk).coins, full);
  s.weekOf = wk; s.weekSteps = { [WEEKLY[0].name]: WEEKLY[0].steps, [WEEKLY[1].name]: 1 };
  const w = weekLeft(s, wk);
  assert.equal(w.list.some((x) => x.m.name === WEEKLY[0].name), false);
  assert.equal(w.exact, false); // one partial mission
  assert.equal(weekLeft(s, 2000).coins, full); // next week
  const sum = seasonSummary(s, 0, wk);
  assert.equal(sum.thisWeek, w.coins);
});
