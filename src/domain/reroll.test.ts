import { test } from "node:test";
import assert from "node:assert/strict";
import { REROLL_POOLS, planPiece, rankPlans, chanceOf } from "./reroll.ts";

test("every slot's draw adds up to 100% (stats + the class's skills)", () => {
  for (const [slot, p] of Object.entries(REROLL_POOLS)) {
    const sum = Object.values(p.stats).reduce((a, b) => a + b, 0) + p.skills.count * p.skills.pct;
    assert.ok(Math.abs(sum - 100) < 0.01, `${slot}: ${sum}`);
  }
});

test("one try's chance: the ideal lines missing over the draw without the piece's own lines", () => {
  // kisk.app's earrings (screenshot 2026-11-27): Critical Hit Resist, Intelligence, HP, Defense; six stats and two
  // passive skills wanted: (1.6×3 + 4.8×3 + 2×2) / (100 − 7.2 − 1.6 − 7.2 − 4.8) = 23.2 / 79.2 = 29.3%, its "29% a try".
  const ideal = ["Might", "Precision", "Attack", "Move Speed", "Critical Hit", "Accuracy", "Empyrean Lord's Grace", "Earth's Grace"].map((stat) => ({ stat, value: "", pct: 100 }));
  const p = planPiece("Earring", ["Critical Hit Resist", "Intelligence", "HP", "Defense"], ideal, 0)!;
  assert.equal(p.steps.length, 4);
  assert.equal(Math.round(p.steps[0].chance * 1000), 293);
  assert.ok(p.steps[3].chance < p.steps[0].chance, "fewer lines left to want");
  assert.equal(p.score, 0);
  assert.equal(Math.round(p.after), 100);
  assert.equal(chanceOf(REROLL_POOLS.Earring, "Earth's Grace"), 2);
});

test("a piece already ideal has nothing to reroll; the ranking puts it last", () => {
  const ideal = [{ stat: "Might", value: "", pct: 100 }, { stat: "Attack", value: "", pct: 90 }];
  const done = planPiece("Ring", ["Might", "Attack"], ideal, 0)!;
  const todo = planPiece("Ring", ["HP", "Attack"], ideal, 0)!;
  assert.equal(done.steps.length, 0);
  assert.equal(done.score, 100);
  assert.equal(todo.steps[0].line, "HP");
  assert.deepEqual(rankPlans([{ n: 1, plan: done }, { n: 2, plan: todo }]).map((x) => x.n), [2, 1]);
});

test("a reset's odds are simulated the same each time", () => {
  const ideal = [{ stat: "Might", value: "", pct: 100 }];
  const a = planPiece("Ring", ["HP", "MP"], ideal, 2000)!.reset!, b = planPiece("Ring", ["HP", "MP"], ideal, 2000)!.reset!;
  assert.deepEqual(a, b);
  assert.ok(a.ideal > 0 && a.ideal < 0.1);
});
