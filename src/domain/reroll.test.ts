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
  const ideal = [...["Might", "Precision", "Attack", "Move Speed", "Critical Hit", "Accuracy"].map((stat) => ({ stat, pct: 100 })),
    ...["Empyrean Lord's Grace", "Earth's Grace"].map((stat) => ({ stat, pct: 100, skill: true }))];
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

test("a bracelet: 4 of 8 Soul Binding lines, the other four at 25% when one is rebound; Time [Siel] left out", () => {
  // The player's screenshot 2026-11-27: Illusion, Destruction, Justice, Freedom on the bracelet; rebinding shows
  // Life, Death, Wisdom, Destiny at 25% each.
  const ideal = ["Time [Siel]", "Destruction [Zikel]", "Wisdom [Lumiel]", "Illusion [Kaisinel]", "Justice [Nezekan]"].map((stat) => ({ stat, value: "", pct: 100 }));
  const p = planPiece("Bracelet", ["Illusion [Kaisinel]", "Destruction [Zikel]", "Justice [Nezekan]", "Freedom [Vaizel]"], ideal, 0)!;
  assert.deepEqual(p.steps.map((s) => s.line), ["Freedom [Vaizel]"]);
  assert.equal(p.steps[0].chance, 0.25);
  assert.deepEqual(p.missing, ["Wisdom [Lumiel]"]);
  assert.deepEqual(p.unobtainable, ["Time [Siel]"]);
  assert.equal(Math.round(p.score), 75);
});

test("a Philosopher's Stone line: once per piece, drawn without the piece's own lines; never on bracelets", () => {
  const ideal = [{ stat: "Might", value: "", pct: 100 }, { stat: "Attack", value: "", pct: 50 }];
  const p = planPiece("Ring", ["HP", "MP"], ideal, 0, true)!;
  // (1.6 + 4.8) / (100 - 7.6 - 7.6); the ideal one is Might a quarter of the time
  assert.equal(Math.round(p.add!.chance * 10000), Math.round((6.4 / 84.8) * 10000));
  assert.equal(p.add!.worth, (1.6 * 100 + 4.8 * 50) / 6.4);
  assert.equal(planPiece("Ring", ["HP", "MP"], ideal, 0, false)!.add, null);
  const b = [{ stat: "Wisdom [Lumiel]", value: "", pct: 100 }];
  assert.equal(planPiece("Bracelet", ["Justice [Nezekan]"], b, 0, true)!.add, null);
});

test("kisk's tiers: the player's earrings (Attack, Natural MP Regen, MP, Might) land 33% a try", () => {
  // kisk.app 2026-11-27: Best Precision, Move Speed, Accuracy; Good Critical Hit and three skills; Fine Block: 33% a try.
  const ideal = [
    ...Object.entries({ "Move Speed": 100, Might: 100, Attack: 100, Precision: 98, Accuracy: 93, "Critical Hit": 89, Block: 64, Defense: 4 }).map(([stat, pct]) => ({ stat, pct })),
    ...["Fury", "Impact Hit", "Insulting Roar"].map((stat) => ({ stat, pct: 80, skill: true })),
  ];
  const p = planPiece("Earring", ["Attack", "Natural MP Regen", "MP", "Might"], ideal, 0)!;
  assert.deepEqual(p.steps.map((s) => s.line), ["MP", "Natural MP Regen"]); // the least likely first
  assert.equal(Math.round(p.steps[0].chance * 100), 33);
});

test("a line the slot's draw doesn't hold counts for the score but isn't aimed at", () => {
  const ideal = [{ stat: "Perfect Chance", pct: 94 }, { stat: "Attack", pct: 78 }, { stat: "Double Chance", pct: 100 }];
  const p = planPiece("Cape", ["Attack", "HP"], ideal, 0)!;
  assert.deepEqual(p.missing, ["Double Chance"]);
  assert.deepEqual(p.unobtainable, ["Perfect Chance"]);
  assert.deepEqual(p.steps.map((s) => s.line), ["HP"]);
});

test("rank tables: tier values, a little less down a tier, skills worth B, slots left out", async () => {
  const { rankTable, rankSkills } = await import("./reroll.ts");
  const file = { tiers: { S: 100, A: 80, B: 60, C: 20 }, slots: { Torso: [["Damage Boost", "S"], ["Attack", "A"], ["Critical Hit", "B", "depends"], ["Accuracy", "C"]] as [string, string, string?][] } };
  const t = rankTable(file, "Torso")!;
  assert.deepEqual(t.worth, { "Damage Boost": 100, Attack: 80, "Critical Hit": 60, Accuracy: 20 });
  assert.deepEqual(t.ranked["Critical Hit"], { rank: "B", note: "depends" });
  assert.equal(rankTable(file, "Ring"), null);
  assert.deepEqual(rankSkills(file, [{ stat: "Fury", pct: 79 }, { stat: "Block Pain", pct: 2 }]), [{ stat: "Fury", pct: 60 }, { stat: "Block Pain", pct: 2 }]);
});

test("the order: what the next try adds, not the whole plan's average (a Ranger's bow, gloves, earrings, 2026-11-27)", () => {
  const w = (o: Record<string, number>) => Object.entries(o).map(([stat, pct]) => ({ stat, pct }));
  const sk = (stat: string) => ({ stat, pct: 60, skill: true });
  const bow = planPiece("Weapon", ["Combat Speed", "Weapon Damage Boost", "Multi-hit Chance"], w({ "Combat Speed": 100, "Weapon Damage Boost": 99, "Damage Boost": 98, Might: 80, Attack: 79 }), 0)!;
  const ear = planPiece("Earring", ["Critical Hit", "Accuracy", "Critical Hit Resist", "Natural HP Regen"], [...w({ Might: 100, Attack: 80, "Move Speed": 79, Precision: 78 }), sk("Focused Eye"), sk("Hunter's Resolve")], 0)!;
  const glo = planPiece("Gloves", ["Combat Speed", "Hunter's Soul", "Melee Fire", "Perfect Chance"], [...w({ "Combat Speed": 100, Attack: 80, "Critical Hit": 60, Accuracy: 59 }), sk("Focused Eye")], 0)!;
  // As the page showed them: 14% / 18% / 14% a try, ≈8 / ≈38 / ≈31 tries.
  assert.deepEqual([bow, ear, glo].map((p) => Math.round(100 * p.steps[0].chance)), [14, 18, 14]);
  assert.deepEqual([bow, ear, glo].map((p) => Math.ceil(p.tries)), [8, 38, 31]);
  // The whole plan's average put the bow first; the next try's worth puts the earrings first.
  const avg = (p: typeof bow) => (p.after - p.score) / p.tries;
  assert.ok(avg(bow) > avg(glo) && avg(glo) > 0 && avg(bow) > avg(ear));
  assert.deepEqual(rankPlans([{ n: "bow", plan: bow }, { n: "glo", plan: glo }, { n: "ear", plan: ear }]).map((x) => x.n), ["ear", "bow", "glo"]);
});
