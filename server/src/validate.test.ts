// Run with: node --test "server/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALLUP_TITLE, callupPost, cellOf, dueAlerts, isWebhook, MAX_MESSAGE, nextSend, parseCallup, MAX_CUBES, MAX_FIGHT, MAX_LEAD, MAX_POSTS, MAX_ROWS, MAX_TIMERS, nextDue, normCode, parseAdmin, parseBossPost,
  parseCubePost, parseGuildCreate, parseGuildFight, parseJoin, parseMePost, parseServerId, parseShare, TIME_RANGE,
} from "./validate.ts";

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const ID = "0b9f6c7e-1a2b-4c3d-8e9f-0123456789AB";
const t = (bossId: number, timeMs: number, extra = {}) => ({ mapId: 999, bossId, name: "Boss", up: false, timeMs, seenMs: 1, ...extra });

test("boss post: clock shifted, seenMs stamped, mapId forced, unknown time kept at 0", () => {
  // Player clock 10 min fast.
  const p = parseBossPost({ install: ID, serverId: 2001, sentMs: NOW + 10 * MIN, maps: [{ mapId: 5, timers: [t(1, NOW + 40 * MIN), t(2, 0)] }] }, NOW);
  assert.deepEqual(p, {
    install: ID.toLowerCase(), serverId: 2001,
    maps: [{ mapId: 5, timers: [
      { mapId: 5, bossId: 1, name: "Boss", up: false, timeMs: NOW + 30 * MIN, seenMs: NOW },
      { mapId: 5, bossId: 2, name: "Boss", up: false, timeMs: 0, seenMs: NOW },
    ] }],
  });
});

test("boss post: bad timers dropped, names clamped, maps left empty skipped", () => {
  const p = parseBossPost({ install: ID, serverId: 1, sentMs: NOW, maps: [
    { mapId: 5, timers: [t(1, NOW + TIME_RANGE + 1), t(0, NOW), t(3, NaN), t(4, NOW, { up: "yes" }), t(5, NOW, { name: "x".repeat(99) }), t(6, NOW, { name: 7 })] },
    { mapId: 6, timers: [t(1, -5)] },
  ] }, NOW);
  assert.deepEqual(p?.maps.map((m) => m.timers.map((x) => [x.bossId, x.name.length])), [[[5, 64], [6, 0]]]);
});

test("boss post: whole body rejected when the frame is wrong", () => {
  const ok = { install: ID, serverId: 1, sentMs: NOW, maps: [] };
  assert.ok(parseBossPost(ok, NOW));
  for (const bad of [null, [], "x", { ...ok, install: "abc" }, { ...ok, serverId: 0 }, { ...ok, serverId: 1.5 },
    { ...ok, sentMs: "now" }, { ...ok, maps: {} }, { ...ok, maps: [{ mapId: -1, timers: [] }] },
    { ...ok, maps: [{ mapId: 1, timers: Array.from({ length: MAX_TIMERS + 1 }, (_, i) => t(i + 1, NOW)) }] }])
    assert.equal(parseBossPost(bad, NOW), null, JSON.stringify(bad)?.slice(0, 80));
});

test("cube post: shifted, null code kept, bad cubes and codes dropped", () => {
  const p = parseCubePost({ install: ID, sentMs: NOW - MIN, mapId: 20, codes: [1301199, 1301199, "x", -3], cubes: [
    { x: 1.5, y: 2, z: 3, code: 1301199, atMs: NOW - 2 * MIN },
    { x: 1, y: 2, z: 3, code: null, atMs: NOW },
    { x: Infinity, y: 2, z: 3, code: 1, atMs: NOW },
    { x: 1, y: 2, z: 3, code: 1, atMs: 0 },
    { x: 1, y: 2, z: 3, code: 2.5, atMs: NOW },
  ] }, NOW);
  assert.deepEqual(p, { install: ID.toLowerCase(), mapId: 20, codes: [1301199], cubes: [
    { x: 1.5, y: 2, z: 3, code: 1301199, atMs: NOW - MIN },
    { x: 1, y: 2, z: 3, code: null, atMs: NOW + MIN },
  ] });
  assert.equal(parseCubePost({ install: ID, sentMs: NOW, mapId: 20, cubes: Array(MAX_CUBES + 1).fill({}) }, NOW), null);
  assert.equal(parseCubePost({ install: ID, sentMs: NOW, mapId: 0, cubes: [] }, NOW), null);
  assert.deepEqual(parseCubePost({ install: ID, sentMs: NOW, mapId: 1, cubes: [] }, NOW)?.codes, []);
});

test("cells and server ids", () => {
  assert.equal(cellOf(299, -1), "0,-1");
  assert.equal(cellOf(300, 650), "1,2");
  assert.equal(parseServerId("2001"), 2001);
  for (const s of ["0", "-1", "1.5", "abc", "", "1e3", "9999999999"]) assert.equal(parseServerId(s), null, s);
});

// ---- Guilds ----

const ME = { name: " Krajetum ", className: "Gladiator", itemLevel: 3012.6, combatPower: 120000 };
const CODE = "ABCD-EFGH-2345-6767";

test("codes: case, dashes and spaces ignored; wrong length or letters refused", () => {
  assert.equal(normCode(" abcd efgh 2345 6767 "), "ABCDEFGH23456767");
  assert.equal(normCode(CODE), "ABCDEFGH23456767");
  for (const bad of ["ABCD", "ABCDEFGH23456781", "ABCDEFGH234567670", 42, null]) assert.equal(normCode(bad), null);
});

test("webhook: only Discord webhooks", () => {
  assert.ok(isWebhook("https://discord.com/api/webhooks/123456/abc_DEF-9"));
  assert.ok(isWebhook("https://discordapp.com/api/webhooks/1/x"));
  for (const bad of ["http://discord.com/api/webhooks/1/x", "https://evil.com/api/webhooks/1/x", "https://discord.com.evil.com/api/webhooks/1/x",
    "https://discord.com/api/webhooks/1/x?wait=true", "https://discord.com/api/webhooks/x/y", 7]) assert.equal(isWebhook(bad), false, String(bad));
});

test("create / join: name trimmed, numbers rounded, consent defaults gear on and fights off", () => {
  assert.deepEqual(parseGuildCreate({ install: ID, name: "  Static  ", serverId: 1301, me: ME }), {
    install: ID.toLowerCase(), name: "Static", serverId: 1301, me: { name: "Krajetum", className: "Gladiator", itemLevel: 3013, combatPower: 120000 },
  });
  assert.equal(parseGuildCreate({ install: ID, name: " ", serverId: 1301, me: ME }), null);
  assert.equal(parseGuildCreate({ install: "x", name: "S", serverId: 1301, me: ME }), null);
  assert.equal(parseGuildCreate({ install: ID, name: "S", serverId: 1301, me: { name: "" } }), null);
  const j = parseJoin({ install: ID, code: CODE, me: { name: "A", itemLevel: -3 } });
  assert.deepEqual(j?.share, { gear: true, fights: false });
  assert.equal(j?.me.itemLevel, null);
  assert.deepEqual(parseShare({ gear: false, fights: true }), { gear: false, fights: true });
  assert.equal(parseJoin({ install: ID, code: "nope", me: ME }), null);
});

test("me post: leave, share only, or a new card; a bad card refused", () => {
  assert.equal(parseMePost({ install: ID, leave: true })?.leave, true);
  assert.equal(parseMePost({ install: ID, share: { fights: true } })?.me, null);
  assert.equal(parseMePost({ install: ID, me: ME })?.me?.name, "Krajetum");
  assert.equal(parseMePost({ install: ID, me: { name: 3 } }), null);
});

test("fight: fields checked, size capped", () => {
  const fight = { id: "f1", boss: "Gartua", endMs: NOW, battleTimeMs: 90_000, killed: true, rows: [{ name: "A", dps: 1 }] };
  const f = parseGuildFight({ install: ID, fight });
  assert.equal(f?.battleMs, 90_000);
  assert.deepEqual(JSON.parse(f!.record), fight);
  assert.equal(parseGuildFight({ install: ID, fight: { ...fight, killed: "yes" } }), null);
  assert.equal(parseGuildFight({ install: ID, fight: { ...fight, rows: [1] } }), null);
  assert.equal(parseGuildFight({ install: ID, fight: { ...fight, rows: Array(MAX_ROWS + 1).fill({}) } }), null);
  assert.equal(parseGuildFight({ install: ID, fight: { ...fight, pad: "x".repeat(MAX_FIGHT) } }), null);
});

test("admin: webhook set or removed, lead in range, anything else refused", () => {
  assert.deepEqual(parseAdmin({ officerKey: CODE, webhook: "", leadMin: 10, test: true }),
    { officerKey: "ABCDEFGH23456767", webhook: null, leadMin: 10, rotateCode: false, test: true });
  assert.equal(parseAdmin({ officerKey: CODE, webhook: "https://example.com/hook" }), null);
  assert.equal(parseAdmin({ officerKey: CODE, leadMin: MAX_LEAD + 1 }), null);
  assert.equal(parseAdmin({ officerKey: CODE, remove: " " }), null);
  assert.equal(parseAdmin({ webhook: "" }), null);
});

test("next due: earliest boss not up, in the future", () => {
  assert.equal(nextDue([t(1, NOW + 20 * MIN), t(2, NOW + 5 * MIN), t(3, NOW + MIN, { up: true }), t(4, NOW - MIN), t(5, 0)], NOW), NOW + 5 * MIN);
  assert.equal(nextDue([t(1, NOW - MIN)], NOW), null);
});

test("due alerts: within each guild's lead, its server only, posted ones skipped, one message per guild", () => {
  const maps = [
    { serverId: 1, mapId: 10, timers: [t(1, NOW + 3 * MIN, { mapId: 10, name: "**Gartua**" }), t(2, NOW + 12 * MIN, { mapId: 10 })] },
    { serverId: 2, mapId: 10, timers: [t(1, NOW + 2 * MIN, { mapId: 10 })] },
  ];
  const guilds = [
    { id: "a", serverId: 1, webhook: "w1", leadMin: 5 },
    { id: "b", serverId: 1, webhook: "w2", leadMin: 15 },
    { id: "c", serverId: 2, webhook: "w3", leadMin: 5 },
  ];
  const out = dueAlerts(maps, guilds, new Set(["c|10:1"]), NOW);
  assert.deepEqual(out.map((a) => [a.guildId, a.keys]), [["a", ["10:1"]], ["b", ["10:1", "10:2"]]]);
  const s = Math.round((NOW + 3 * MIN) / 1000);
  assert.equal(out[0].content, `**Gartua** respawns <t:${s}:R> (<t:${s}:t>)`);
  const many = Array.from({ length: MAX_POSTS + 5 }, (_, i) => ({ id: `g${i}`, serverId: 1, webhook: "w", leadMin: 5 }));
  assert.equal(dueAlerts(maps, many, new Set(), NOW).length, MAX_POSTS);
});

// ---- Call-ups ----

const DAY_MIN = 24 * 60;
const callup = (extra = {}) => ({ officerKey: CODE, sentMs: NOW, atMs: NOW + 3 * 24 * 60 * MIN, message: "Raid Gartua, bring pots", ping: "none", leads: [DAY_MIN, 2 * DAY_MIN], ...extra });

test("call-up: clock shifted, leads sorted and deduplicated, mentions stripped", () => {
  const c = parseCallup(callup({ sentMs: NOW + 10 * MIN, leads: [60, DAY_MIN, 60, 0], message: " @everyone go <@123> <@&456> @here " }), NOW);
  assert.equal(c?.atMs, NOW + 3 * 24 * 60 * MIN - 10 * MIN);
  assert.deepEqual(c?.leads, [DAY_MIN, 60, 0]);
  assert.equal(c?.message, "everyone go   here");
});

test("call-up: refused when past, too far, empty, bad ping or bad leads", () => {
  for (const bad of [
    callup({ atMs: NOW - MIN }), callup({ atMs: NOW + 61 * 24 * 60 * MIN }), callup({ message: "  " }),
    callup({ ping: "role" }), callup({ leads: [] }), callup({ leads: [1, 2, 3, 4, 5, 6] }), callup({ leads: [-1] }), callup({ leads: [15 * DAY_MIN] }),
    callup({ leads: [1.5] }), callup({ officerKey: "x" }), callup({ sentMs: undefined }),
  ]) assert.equal(parseCallup(bad, NOW), null, JSON.stringify(bad));
  assert.equal(parseCallup(callup({ ping: "everyone" }), NOW)?.ping, "everyone");
  assert.equal(parseCallup(callup({ message: "x".repeat(MAX_MESSAGE + 50) }), NOW)?.message.length, MAX_MESSAGE);
});

test("next send: the earliest reminder still to come", () => {
  const at = NOW + 3 * 24 * 60 * MIN;
  assert.equal(nextSend(at, [2 * DAY_MIN, DAY_MIN, 0], NOW), at - 2 * DAY_MIN * MIN);
  assert.equal(nextSend(at, [2 * DAY_MIN, DAY_MIN, 0], at - 2 * DAY_MIN * MIN), at - DAY_MIN * MIN);
  assert.equal(nextSend(at, [5 * DAY_MIN, DAY_MIN], NOW), at - DAY_MIN * MIN); // 5 days before is already past
  assert.equal(nextSend(at, [0], at), null);
});

test("call-up post: fixed title, the message, the ping only when asked", () => {
  const at = NOW + 60 * MIN, s = Math.round(at / 1000);
  const quiet = callupPost({ atMs: at, message: "Raid", ping: "none" });
  assert.equal(quiet.embeds[0].title, CALLUP_TITLE);
  assert.equal(quiet.embeds[0].description, "Raid");
  assert.equal(quiet.embeds[0].fields[0].value, `<t:${s}:F> (<t:${s}:R>)`);
  assert.equal(quiet.content, "");
  assert.deepEqual(quiet.allowed_mentions.parse, []);
  const loud = callupPost({ atMs: at, message: "Raid", ping: "here" });
  assert.equal(loud.content, "@here");
  assert.deepEqual(loud.allowed_mentions.parse, ["everyone"]);
});

test("admin: boss alerts switch must be a boolean", () => {
  assert.equal(parseAdmin({ officerKey: CODE, bossAlerts: false })?.bossAlerts, false);
  assert.equal(parseAdmin({ officerKey: CODE })?.bossAlerts, undefined);
  assert.equal(parseAdmin({ officerKey: CODE, bossAlerts: "yes" }), null);
});
