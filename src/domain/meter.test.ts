// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { clock, hpLeft, short, viewRows, type Fight, type PlayerRow } from "./meter.ts";

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

const row = (id: number, damage: number, heal: number, damageTaken: number): PlayerRow => ({
  id, name: "", job: "", dps: damage / 10, damage, share: 0, hps: heal / 10, heal, combatPower: 0, gearScore: 0,
  isYou: false, inParty: false, isOthers: false, damageTaken, hitsTaken: 0, skills: [], healSkills: [],
});
const fight: Fight = { target: null, targetMode: "bossTargets", battleTimeMs: 10_000, rows: [row(1, 300, 0, 50), row(2, 100, 900, 0), row(3, 0, 100, 150)] };

test("healing view: only healers, ranked by healing, shares of the healing", () => {
  const v = viewRows(fight, "healing");
  assert.deepEqual(v.map((x) => [x.row.id, x.value, x.perSec, x.share]), [[2, 900, 90, 90], [3, 100, 10, 10]]);
});

test("damage taken view: per second over the fight", () => {
  const v = viewRows(fight, "taken");
  assert.deepEqual(v.map((x) => [x.row.id, x.value, x.perSec, x.share]), [[3, 150, 15, 75], [1, 50, 5, 25]]);
});

test("damage view keeps the engine's share", () => {
  assert.deepEqual(viewRows(fight, "damage").map((x) => x.row.id), [1, 2]);
});
