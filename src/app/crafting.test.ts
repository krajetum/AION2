import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultData } from "../domain/save-file.ts";
import { fillOwned } from "./crafting.ts";

test("filling from the game: items with a code take the inventory's count (0 = none), typed ones without a code stay", () => {
  const data = defaultData();
  data.crafting.items = {
    ore: { id: "ore", name: "Ore", code: 610100001 },
    gem: { id: "gem", name: "Gem", code: 610100002 },
    mine: { id: "mine", name: "My item" },
  };
  data.crafting.owned.Me = { gem: 7, mine: 3 };
  assert.equal(fillOwned(data, "Me", { "610100001": 42, "930100031": 5 }), 2);
  assert.deepEqual(data.crafting.owned.Me, { ore: 42, mine: 3 });
});
