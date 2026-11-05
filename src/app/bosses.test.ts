import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultData } from "../domain/save-file.ts";
import { armDefaultBosses, toggleBossAlert } from "./bosses.ts";

const boss = (bossId: number, name: string) => ({ mapId: 1, bossId, name, up: false, timeMs: 0, seenMs: 0 });

test("Immortal Gartua is armed by default, once: turned off, it stays off", () => {
  const data = defaultData();
  data.bosses = [boss(7, "Immortal Gartua"), boss(8, "High Commander Lagta")];
  assert.equal(armDefaultBosses(data), true);
  assert.deepEqual(data.bossAlerts[7], { leads: [5], repeat: true });
  assert.equal(data.bossAlerts[8], undefined);
  toggleBossAlert(data, 7); // the player turns it off
  assert.equal(armDefaultBosses(data), false);
  assert.equal(data.bossAlerts[7], undefined);
});
