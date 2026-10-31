// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCrafting, craftCost, explode, wouldCycle, type CraftData, type CraftItem } from "./crafting.ts";

// aion2hub's Splendent Star Dragon Lord Staff: 11 Enhanced Thick Balaur Scale + 4 Wrathful Mind; a scale from
// 2 Balaur's Essence + 1 Lesser Dragon Scale Hardener (Bound: no market price).
function staff(): CraftData {
  const it = (id: string, more: Partial<CraftItem> = {}): CraftItem => ({ id, name: id, ...more });
  return {
    items: {
      staff: it("staff", { recipe: { inputs: [{ item: "scale", qty: 11 }, { item: "mind", qty: 4 }], yields: 1, kina: 1000 } }),
      scale: it("scale", { price: 50_000, recipe: { inputs: [{ item: "essence", qty: 2 }, { item: "hardener", qty: 1 }], yields: 1, kina: 100 } }),
      mind: it("mind", { price: 20_000 }),
      essence: it("essence", { price: 3_000 }),
      hardener: it("hardener"),
    },
    targets: [{ item: "staff", qty: 1 }],
    owned: {},
  };
}
const line = (b: ReturnType<typeof explode>, id: string) => b.lines.find((l) => l.item === id);

test("nested recipes: stock first, crafted materials split into their inputs, Bound ones to farm", () => {
  const b = explode(staff(), { scale: 3, mind: 1 });
  assert.deepEqual(line(b, "staff"), { item: "staff", level: 0, need: 1, used: 0, craft: 1, buy: 0, cost: 0, fee: 1000 });
  assert.deepEqual(line(b, "scale"), { item: "scale", level: 1, need: 11, used: 3, craft: 8, buy: 0, cost: 0, fee: 800 });
  assert.equal(line(b, "mind")!.buy, 3);
  assert.equal(line(b, "essence")!.buy, 16);
  assert.equal(line(b, "hardener")!.buy, 8);
  assert.deepEqual(b.unpriced, ["hardener"]);
  assert.equal(b.buyKina, 3 * 20_000 + 16 * 3_000);
  assert.equal(b.total, b.buyKina + 1800);
});

test("stock covering an intermediate needs none of its inputs; a bought intermediate neither", () => {
  assert.deepEqual(explode(staff(), { scale: 20 }).lines.map((l) => l.item), ["staff", "scale", "mind"]);
  const d = staff();
  d.items.scale.buy = true;
  const b = explode(d);
  assert.equal(line(b, "scale")!.buy, 11);
  assert.equal(line(b, "scale")!.cost, 550_000);
  assert.equal(line(b, "essence"), undefined);
});

test("a material used by two recipes is summed before rounding to its yield", () => {
  const d = staff();
  d.items.mind.recipe = { inputs: [{ item: "essence", qty: 1 }], yields: 1, kina: 0 };
  d.items.scale.recipe!.inputs.push({ item: "mind", qty: 1 }); // mind is now used by staff (level 1) and scale (level 2)
  d.items.essence.recipe = { inputs: [{ item: "hardener", qty: 1 }], yields: 5, kina: 0 };
  const b = explode(d);
  assert.equal(line(b, "mind")!.level, 2);
  assert.equal(line(b, "mind")!.need, 4 + 11);
  assert.equal(line(b, "essence")!.need, 22 + 15);
  assert.equal(line(b, "essence")!.craft, 8, "37 in batches of 5");
  assert.equal(line(b, "hardener")!.need, 11 + 8);
});

test("craft or buy: the crafted cost per piece, undefined while an input has no price", () => {
  const d = staff();
  assert.equal(craftCost(d, "scale"), undefined);
  d.items.hardener.price = 10_000;
  assert.equal(craftCost(d, "scale"), 100 + 2 * 3_000 + 10_000);
  assert.equal(craftCost(d, "staff"), 1000 + 11 * 16_100 + 4 * 20_000);
  d.items.scale.buy = true;
  assert.equal(craftCost(d, "staff"), 1000 + 11 * 50_000 + 4 * 20_000, "a bought input at its price");
  assert.equal(craftCost(d, "mind"), undefined, "no recipe");
});

test("loops are caught before they are saved, and survived if one is loaded", () => {
  const d = staff();
  assert.equal(wouldCycle(d, "essence", "staff"), true);
  assert.equal(wouldCycle(d, "scale", "scale"), true);
  assert.equal(wouldCycle(d, "mind", "essence"), false);
  d.items.essence.recipe = { inputs: [{ item: "staff", qty: 1 }], yields: 1, kina: 0 };
  assert.ok(explode(d).lines.length);
  assert.equal(craftCost(d, "staff"), undefined);
});

test("cleaning a save drops broken items, inputs and targets of items that are gone", () => {
  const c = cleanCrafting({
    items: { a: { name: " A ", price: 5, priceAt: 1, recipe: { inputs: [{ item: "b", qty: 2 }, { item: "gone", qty: 1 }], yields: 0 } },
      b: { name: "B", code: 600590001, price: -1 }, c: { name: "" } },
    targets: [{ item: "a", qty: 2 }, { item: "c", qty: 1 }],
    owned: { Main: { b: 3, a: "x" } },
  });
  assert.deepEqual(c.items.a, { id: "a", name: "A", price: 5, priceAt: 1, recipe: { inputs: [{ item: "b", qty: 2 }], yields: 1, kina: 0 } });
  assert.deepEqual(c.items.b, { id: "b", name: "B", code: 600590001 });
  assert.equal(c.items.c, undefined);
  assert.deepEqual(c.targets, [{ item: "a", qty: 2 }]);
  assert.deepEqual(c.owned, { Main: { b: 3 } });
  assert.deepEqual(cleanCrafting(undefined), { items: {}, targets: [], owned: {} });
});
