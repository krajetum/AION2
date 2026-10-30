// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { addFight, compareSkills, fightEnded, MAX_FIGHTS, personalBests, toRecord, type FightRecord } from "./fights.ts";
import type { Fight, PlayerRow, SkillRow } from "./meter.ts";

const skill = (name: string, damage: number): SkillRow => ({ name, damage, hits: 1, critRate: 0, share: 0, dot: false, icon: null });
const row = (dps: number, skills: SkillRow[] = []): PlayerRow => ({
  id: 1, name: "Me", job: "Gladiator", dps, damage: dps * 60, share: 100, hps: 0, heal: 0, combatPower: 0, gearScore: 0,
  isYou: true, inParty: true, isOthers: false, damageTaken: 0, hitsTaken: 0, skills, healSkills: [],
});
const fight = (name: string, ms: number, isBoss = true, currentHp = 0): Fight =>
  ({ target: { name, isBoss, maxHp: 100, currentHp, damageDealt: 100 }, targetMode: "bossTargets", battleTimeMs: ms, rows: [row(1000)] });
const rec = (id: string, boss: string, dps: number, ms: number, killed = true): FightRecord =>
  ({ id, endMs: 0, battleTimeMs: ms, boss, maxHp: 100, killed, mapId: null, char: "Me", gearScore: null, combatPower: null, rows: [row(dps)] });

test("a boss fight ends when its time goes back or the target changes", () => {
  assert.equal(fightEnded(fight("Boss", 60_000), fight("Boss", 61_000)), false);
  assert.equal(fightEnded(fight("Boss", 60_000), { ...fight("", 0), target: null }), true); // idle reset
  assert.equal(fightEnded(fight("Boss", 60_000), fight("Other", 61_000)), true);
});

test("short fights and non-boss targets are not kept", () => {
  assert.equal(fightEnded(fight("Boss", 5_000), fight("", 0)), false);
  assert.equal(fightEnded(fight("Mob", 60_000, false), fight("", 0)), false);
  assert.equal(fightEnded(undefined, fight("Boss", 0)), false);
});

test("a record knows whether the boss died", () => {
  assert.equal(toRecord(fight("Boss", 60_000), null, 7, 1).killed, true);
  assert.equal(toRecord(fight("Boss", 60_000, true, 40), null, 7, 1).killed, false);
});

test("personal bests: best DPS of any fight, fastest of the kills", () => {
  const b = personalBests([rec("a", "B", 100, 90_000), rec("b", "B", 300, 120_000, false), rec("c", "B", 200, 60_000)]).B;
  assert.equal(b.fights, 3);
  assert.equal(b.kills, 2);
  assert.equal(b.dps?.id, "b");
  assert.equal(b.fastest?.id, "c");
});

test("the log is capped, but personal bests stay", () => {
  let log: FightRecord[] = [rec("best", "B", 9999, 1000)];
  for (let i = 0; i < MAX_FIGHTS + 5; i++) log = addFight(log, rec(`f${i}`, "B", 10, 60_000));
  assert.equal(log.length, MAX_FIGHTS + 1);
  assert.equal(log.at(-1)?.id, "best");
  assert.equal(log[0].id, `f${MAX_FIGHTS + 4}`);
});

test("skills compare by damage per second, matched by name", () => {
  const a = { ...rec("a", "B", 0, 10_000), rows: [row(0, [skill("Slash", 10_000), skill("Old", 1_000)])] };
  const b = { ...rec("b", "B", 0, 20_000), rows: [row(0, [skill("Slash", 30_000), skill("New", 2_000)])] };
  const d = compareSkills(a, b);
  assert.deepEqual(d.map((x) => [x.name, x.dpsA, x.dpsB]), [["Slash", 1000, 1500], ["Old", 100, 0], ["New", 0, 100]]);
});
