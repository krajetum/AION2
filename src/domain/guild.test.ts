import { test } from "node:test";
import assert from "node:assert/strict";
import { can, DEFAULT_PERMS, myRole, callupKey, cleanGuild, dueCallups, guildFight, leadText, MAX_FIGHT, MAX_ROWS, memberBests, parseGuild, parseGuildFights, rosterRows } from "./guild.ts";
import type { FightRecord } from "./fights.ts";
import type { PlayerRow, SkillRow } from "./meter.ts";

const skill = (name: string, damage: number): SkillRow => ({ name, damage, hits: 1, critRate: 0, share: 0, dot: false, icon: "x".repeat(60) });
const row = (name: string, dps: number, extra: Partial<PlayerRow> = {}): PlayerRow => ({
  id: 1, name, job: "Gladiator", dps, damage: dps * 60, share: 0, hps: 0, heal: 0, combatPower: 0, gearScore: 0,
  isYou: false, inParty: true, isOthers: false, damageTaken: 0, hitsTaken: 0, skills: [skill("Hit", 5)], healSkills: [], ...extra,
});
const fight = (char: string, dps: number, ms: number, killed = true, rows?: PlayerRow[]): FightRecord => ({
  id: `${char}${dps}${ms}`, endMs: 1, battleTimeMs: ms, boss: "Gartua", maxHp: 1, killed, mapId: null, char,
  gearScore: null, combatPower: null, rows: rows ?? [row(char, dps, { isYou: true })],
});

test("cleanGuild: needs an id and a server, keeps codes, consent defaults", () => {
  assert.equal(cleanGuild(null), null);
  assert.equal(cleanGuild({ id: "abc" }), null);
  assert.deepEqual(cleanGuild({ id: "abc", serverId: 1301, name: "S", officerKey: "K" }),
    { id: "abc", name: "S", serverId: 1301, officerKey: "K", share: { gear: true, fights: false } });
});

test("parseGuild: seen times on the local clock, nameless members dropped", () => {
  const g = parseGuild({ serverNow: 1000, id: "g", name: "S", serverId: 2, leadMin: 7, hasWebhook: true,
    members: [{ name: "A", seenMs: 900, itemLevel: 3000 }, { name: "" }, 5], bossAlerts: true }, 5000);
  assert.equal(g.bossAlerts, true);
  assert.equal(parseGuild({}, 0).bossAlerts, false);
  assert.equal(g.members.length, 1);
  assert.equal(g.members[0].seenMs, 4900);
  assert.equal(g.leadMin, 7);
});

test("roles: an old Worker's answer = member with the default table; the leader key = Leader", () => {
  const old = parseGuild({ members: [{ name: "A" }] }, 0);
  assert.equal(old.role, "member");
  assert.deepEqual(old.perms, DEFAULT_PERMS);
  assert.equal(old.memberCount, 1);
  assert.equal(can(old, null, "view.fights"), true);
  assert.equal(can(old, null, "manage.discord"), false);
  assert.equal(can(old, { id: "g", name: "", serverId: 1, officerKey: "K", share: { gear: true, fights: false } }, "manage.discord"), true);
  const g = parseGuild({ role: "officer", perms: { "view.fights": "leader", "manage.discord": "member", bogus: "x", "view.members": "god" },
    members: [{ name: "A", role: "leader", me: true }, { name: "B", role: "boss" }], memberCount: 9 }, 0);
  assert.equal(myRole(g, null), "officer");
  assert.equal(can(g, null, "view.fights"), false);
  assert.equal(can(g, null, "manage.discord"), true);
  assert.equal(g.perms["view.members"], "member");
  assert.deepEqual(g.members.map((m) => [m.role, m.me]), [["leader", true], ["member", false]]);
  assert.equal(g.memberCount, 9);
});

test("rosterRows: official numbers fill gaps, highest item level first", () => {
  const m = (name: string, itemLevel: number | null) => ({ name, className: "", itemLevel, combatPower: null, shareGear: true, shareFights: false, seenMs: 0,
    role: "member" as const, me: false });
  const rows = rosterRows([m("A", 2900), m("B", null), m("C", null)], { B: { itemLevel: 3100, combatPower: 9 } });
  assert.deepEqual(rows.map((r) => [r.name, r.itemLevel, r.official]), [["B", 3100, true], ["A", 2900, false], ["C", null, false]]);
});

test("guildFight: your skills kept, others' dropped, rows capped, under the size limit", () => {
  const many = Array.from({ length: 40 }, (_, i) => row(`P${i}`, i));
  const you = row("Me", 99, { isYou: true, skills: Array.from({ length: 200 }, (_, i) => skill(`S${i}`, i)) });
  const out = guildFight(fight("Me", 99, 60_000, true, [...many, you]));
  assert.equal(out.rows.length, MAX_ROWS);
  assert.equal(out.rows[0].name, "Me");
  assert.ok(out.rows.slice(1).every((r) => r.skills.length === 0));
  assert.equal(out.rows[1].name, "P39");
  assert.ok(JSON.stringify(out).length <= MAX_FIGHT);
  assert.ok(out.rows[0].skills.length > 0);
  assert.equal(out.rows[0].skills[0].name, "S199"); // biggest kept
});

test("parseGuildFights: bad records dropped, rows filled in", () => {
  const got = parseGuildFights({ fights: [fight("A", 1, 10), { id: 1 }, { ...fight("B", 1, 10), rows: [{ name: "B", isYou: true }] }] });
  assert.equal(got.length, 2);
  assert.equal(got[1].rows[0].dps, 0);
  assert.deepEqual(got[1].rows[0].skills, []);
});

test("memberBests: per member, best DPS first; fastest kill only from kills", () => {
  const b = memberBests([fight("A", 100, 90_000), fight("A", 150, 120_000, false), fight("B", 200, 60_000)]);
  assert.deepEqual(b.map((x) => [x.char, x.fights, x.dps?.battleTimeMs, x.fastest?.battleTimeMs]),
    [["B", 1, 60_000, 60_000], ["A", 2, 120_000, 90_000]]);
});

test("call-ups: parsed onto the local clock; due reminders once, several at once together, past ones skipped", () => {
  const D = 24 * 60, MIN = 60_000, now = 10_000_000_000;
  const g = parseGuild({ serverNow: 1000, callups: [{ id: "c", atMs: 1000 + 3 * D * MIN, message: "Raid", ping: "loud", leads: [2 * D, D, 1.5] }, { id: 2 }] }, 2000);
  assert.deepEqual(g.callups, [{ id: "c", atMs: 2000 + 3 * D * MIN, message: "Raid", ping: "none", leads: [2 * D, D] }]);
  const c = { id: "c", atMs: now + 3 * D * MIN, message: "Raid", ping: "none" as const, leads: [2 * D, D] };
  assert.deepEqual(dueCallups([c], {}, now), []);
  assert.deepEqual(dueCallups([c], {}, now + D * MIN).map((d) => d.leads), [[2 * D]]);
  assert.deepEqual(dueCallups([c], { [callupKey(c, 2 * D)]: c.atMs }, now + D * MIN), []);
  assert.deepEqual(dueCallups([c], {}, now + 2.5 * D * MIN).map((d) => d.leads), [[2 * D, D]]); // app was closed: one reminder
  assert.deepEqual(dueCallups([c], {}, c.atMs + 2 * MIN), []);
});

test("leadText", () => {
  assert.deepEqual([0, 45, 60, 1440, 2880, 1800].map(leadText), ["at the time", "45 min", "1 h", "1 day", "2 days", "1 day 6 h"]);
});
