// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { activeShare, activeText, advancedStats, clock, hpText, fileSize, hpLeft, odyleFor, short, viewRows, type Fight, type MeterUpdate, type PlayerRow } from "./meter.ts";

test("Odyle energy only for the character it belongs to", () => {
  const u = { odyle: { basic: 30, charged: 840, owner: "Naicha" } } as MeterUpdate;
  assert.deepEqual(odyleFor(u, " naicha "), u.odyle);
  assert.equal(odyleFor(u, "Alt"), undefined);
  assert.equal(odyleFor({ odyle: { ...u.odyle!, owner: null } } as MeterUpdate, "Naicha"), undefined);
  assert.equal(odyleFor(undefined, "Naicha"), undefined);
});

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

test("file sizes", () => {
  assert.equal(fileSize(512), "512 B");
  assert.equal(fileSize(20_000), "20 KB");
  assert.equal(fileSize(1_500_000), "1.4 MB");
});

test("advancedStats: the meter's totals, else the kept skills; deaths with their times", () => {
  const r: PlayerRow = { id: 1, name: "A", job: "", dps: 1000, damage: 60_000, share: 0, hps: 0, heal: 0, combatPower: 0, gearScore: 0,
    isYou: true, inParty: true, isOthers: false, damageTaken: 12_000, hitsTaken: 8, deaths: 2, deathTimes: [65_000, 125_400], reviveTimes: [77_000, null], hits: 120, critRate: 0.25,
    skills: [], healSkills: [] };
  const s = Object.fromEntries(advancedStats(r, 60_000).map((x) => [x.label, `${x.value} | ${x.sub}`]));
  assert.equal(s.Hits, "120 | 2.0/s · crit 25%");
  assert.equal(advancedStats(r, 150_000).find((x) => x.label === "Deaths")!.sub, "at 1:05 (dead 12 s), 2:05 (dead 25 s, not revived)");
  assert.equal(s["Damage taken"], "12.0K | 8 hits");
  assert.equal(s.Healing, "— | ");
  const old = { ...r, hits: undefined, critRate: undefined, deaths: undefined, deathTimes: undefined,
    skills: [{ name: "a", damage: 1, hits: 10, critRate: 0.5, share: 0, dot: false, icon: null }, { name: "b", damage: 1, hits: 30, critRate: 0, share: 0, dot: true, icon: null }] };
  const o = Object.fromEntries(advancedStats(old, 10_000).map((x) => [x.label, `${x.value} | ${x.sub}`]));
  assert.equal(o.Hits, "40 | 4.0/s · crit 50%");
  assert.equal(o.Deaths, "— | ");
});

test("active time and HP text", () => {
  const r = { activeMs: 90_000 } as PlayerRow;
  assert.equal(activeShare(r, 120_000), 0.75);
  assert.equal(activeText(r, 120_000), "75%");
  assert.equal(activeText({ activeMs: 200_000 } as PlayerRow, 120_000), "100%");
  assert.equal(activeText({} as PlayerRow, 120_000), "—");
  assert.equal(hpText(0), "killed");
  assert.equal(hpText(0.123), "12% HP left");
  assert.equal(hpText(0.001), "1% HP left");
  assert.equal(hpText(undefined), "");
});
