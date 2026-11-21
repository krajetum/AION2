import { test } from "node:test";
import assert from "node:assert/strict";
import { can, DEFAULT_PERMS, myRole, callupKey, cleanGuild, discordHtml, dueCallups, BACKFILL_FIGHTS, BACKFILL_MS, fightsToShare, groupPulls, isStaticFight, membersIn, guildFight, leadText, MAX_FIGHT, MAX_ROWS, memberBests, PULL_SLACK_MS, parseGuild, parseGuildFights, rosterRows } from "./guild.ts";
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

test("parseGuild: one member per name (two installs), yours else the latest seen, order kept", () => {
  const g = parseGuild({ members: [{ name: "A", seenMs: 5 }, { name: "B", seenMs: 1, me: true }, { name: "B", seenMs: 9 }, { name: "A", seenMs: 7 }] }, 0);
  assert.deepEqual(g.members.map((m) => [m.name, m.seenMs]), [["B", 1], ["A", 7]]);
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
  assert.equal("timeline" in JSON.parse(JSON.stringify(guildFight({ ...out, timeline: [1, 2] }))), false, "the timeline is not uploaded");
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
  assert.deepEqual(dueCallups([c], { [callupKey(c, 2 * D)]: c.atMs - 37 }, now + D * MIN), []); // next sync's clock shift
  assert.deepEqual(dueCallups([c], {}, now + 2.5 * D * MIN).map((d) => d.leads), [[2 * D, D]]); // app was closed: one reminder
  assert.deepEqual(dueCallups([c], {}, c.atMs + 2 * MIN), []);
});

test("discordHtml: escaped, then Discord's marks", () => {
  assert.equal(discordHtml("**Ludra** <b> *now* __u__ ~~no~~ `x` @here\n- balls"),
    "<b>Ludra</b> &lt;b&gt; <i>now</i> <u>u</u> <s>no</s> <code>x</code> here\n• balls");
});

test("leadText", () => {
  assert.deepEqual([0, 45, 60, 1440, 2880, 1800].map(leadText), ["at the time", "45 min", "1 h", "1 day", "2 days", "1 day 6 h"]);
});

test("groupPulls: the same pull from two members is one, each member's own row wins, Others dropped", () => {
  const at = (f: FightRecord, endMs: number): FightRecord => ({ ...f, id: `${f.char}@${endMs}`, endMs });
  const a = at(fight("Ann", 0, 120_000, true, [row("Ann", 100, { isYou: true, deaths: 1 }), row("Bob", 50), row("", 0, { isOthers: true, damage: 9_000 })]), 1_000_000);
  // Bob's PC: ends 12 s later (idle reset, clock), his own numbers; he saw Ann a little lower.
  const b = at(fight("Bob", 0, 118_000, true, [row("Bob", 70, { isYou: true, hits: 300 }), row("Ann", 90)]), 1_012_000);
  const c = at(fight("Ann", 120, 90_000), 1_400_000); // Ann's next pull
  const d = { ...at(fight("Cid", 80, 60_000), 1_005_000), boss: "Other boss" };
  const p = groupPulls([c, a, b, d]);
  assert.deepEqual(p.map((x) => [x.boss, x.chars]), [["Gartua", ["Ann"]], ["Gartua", ["Ann", "Bob"]], ["Other boss", ["Cid"]]]);
  const both = p[1];
  assert.equal(both.battleTimeMs, 120_000);
  assert.equal(both.endMs, 1_012_000);
  assert.deepEqual(both.rows.map((r) => [r.row.name, r.row.dps, r.own, r.row.isYou]), [["Ann", 100, true, false], ["Bob", 70, true, false]]);
  assert.equal(both.rows[0].row.deaths, 1);
  assert.equal(both.rows[1].row.hits, 300);
  assert.equal(Math.round(both.rows[0].row.share + both.rows[1].row.share), 100);
});

test("groupPulls: pulls apart by more than the slack stay apart; a member's two records never merge", () => {
  const f = (char: string, endMs: number): FightRecord => ({ ...fight(char, 10, 60_000), id: `${char}${endMs}`, endMs });
  assert.equal(groupPulls([f("A", 1_000_000), f("B", 1_000_000 + 60_000 + PULL_SLACK_MS + 1)]).length, 2);
  assert.equal(groupPulls([f("A", 1_000_000), f("B", 1_000_000 + 60_000 + PULL_SLACK_MS - 1)]).length, 1);
  assert.equal(groupPulls([f("A", 1_000_000), f("A", 1_000_500)]).length, 2);
});

test("groupPulls: keys stay unique when the Others row carries a player's name", () => {
  const f = { ...fight("Ann", 10, 60_000, false, [row("Ann", 10, { isYou: true }), row("Bob", 5), row("Bob", 3, { isOthers: true })]), id: "x" };
  const [p] = groupPulls([f, { ...f }]);
  const keys = groupPulls([f, { ...f }]).flatMap((x) => x.rows.map((r) => r.key));
  assert.equal(new Set(keys.filter((_, i) => i < p.rows.length)).size, p.rows.length);
  const ids = groupPulls([f, { ...f }]).map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length); // the same record twice: two pulls, two ids
});

test("membersIn / isStaticFight: the static's members with a row, any case, your own row by your character", () => {
  const names = ["Ann", "Bob", "Cid", "Dan", "Eve", "Fay"];
  const rows = (...n: string[]) => n.map((x, i) => row(x, 10, { id: i + 1 }));
  const five = fight("Ann", 10, 60_000, true, [row("", 10, { isYou: true }), ...rows("bob", "Cid", "Dan", "Eve", "Stranger")]);
  assert.equal(membersIn(five, names), 5);
  assert.equal(isStaticFight(five, names), true);
  const four = fight("Ann", 10, 60_000, true, [row("Ann", 10, { isYou: true }), ...rows("Bob", "Bob", "Cid", "Dan", "X", "Y")]);
  assert.equal(membersIn(four, names), 4);
  assert.equal(isStaticFight(four, names), false);
  assert.equal(isStaticFight(five, []), false); // members not known yet: not a static fight
});

test("fightsToShare: static fights of the static character, the past week, newest first, at most BACKFILL_FIGHTS", () => {
  const now = 1_000 * BACKFILL_MS;
  const names = ["Ann", "Bob", "Cid", "Dan", "Eve"];
  const party = (char: string, n: number) => [row(char, 10, { isYou: true }), ...names.filter((x) => x !== char).slice(0, n - 1).map((x, i) => row(x, 5, { id: i + 2 }))];
  const at = (char: string, ago: number, i = 0, n = 5): FightRecord => ({ ...fight(char, 10, 60_000, true, party(char, n)), id: `${char}${ago}${i}`, endMs: now - ago });
  const log = [at("Ann", 1000), at("Bob", 500), at("Ann", BACKFILL_MS + 1), at("Ann", 2000), at("Ann", -5), at("Ann", 1500, 0, 4)];
  assert.deepEqual(fightsToShare(log, "Ann", names, now).map((f) => f.endMs), [now - 1000, now - 2000]);
  assert.deepEqual(fightsToShare(log, "", names, now), []);
  const many = Array.from({ length: BACKFILL_FIGHTS + 5 }, (_, i) => at("Ann", 1000 + i, i));
  assert.equal(fightsToShare(many, "Ann", names, now).length, BACKFILL_FIGHTS);
});

test("guildFight: your buffs go with your row, the others' stay home; parsed back field by field", () => {
  const buff = { id: 22101071, name: "Critical Hit Scroll", upMs: 60_000, own: true, kind: "scroll" as const };
  const f = fight("Ann", 10, 60_000, true, [row("Ann", 10, { isYou: true, buffs: [buff] }), row("Bob", 5, { buffs: [buff] })]);
  const out = guildFight(f);
  assert.deepEqual(out.rows[0].buffs, [buff]);
  assert.equal(out.rows[1].buffs, undefined);
  const [back] = parseGuildFights({ fights: [{ ...out, rows: [{ ...out.rows[0], buffs: [buff, { name: "x", kind: "weird", upMs: "no" }] }] }] });
  assert.deepEqual(back.rows[0].buffs, [buff, { id: 0, name: "x", upMs: 0, own: false, kind: "buff" }]);
});
