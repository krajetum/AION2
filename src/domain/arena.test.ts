// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { logKills, logMatch, mapLabel, matchTotals, MAX_MATCHES, type ArenaLog } from "./arena.ts";
import type { ArenaMatch, ArenaPlayer, ArenaSide } from "./meter.ts";

const p = (id: number, side: ArenaSide, dealt: number, deaths = 0): ArenaPlayer =>
  ({ id, name: `P${id}`, side, job: "", serverId: 0, dealt, taken: 0, hits: 1, deaths, level: null, gearScore: null, combatPower: null });
const m = (startMs: number, players: ArenaPlayer[] = []): ArenaMatch => ({ mapId: 7, startMs, endMs: startMs + 90_000, players });

test("the resent last match is logged once, newest first, capped", () => {
  const log: ArenaLog = { matches: [], maps: {}, kills: [] };
  assert.equal(logMatch(log, m(1)), true);
  assert.equal(logMatch(log, m(1)), false);
  assert.equal(logMatch(log, m(2)), true);
  assert.deepEqual(log.matches.map((x) => x.startMs), [2, 1]);
  for (let i = 3; i < MAX_MATCHES + 10; i++) logMatch(log, m(i));
  assert.equal(log.matches.length, MAX_MATCHES);
});

test("totals: your side against theirs", () => {
  const t = matchTotals(m(0, [p(1, "you", 500, 1), p(2, "ally", 100), p(3, "opponent", 300, 2), p(4, "opponent", 50)]));
  assert.deepEqual(t, { dealt: 600, taken: 350, ourDeaths: 1, theirDeaths: 2, opponents: 2, ms: 90_000 });
});

test("kills: the meter's resent ones once, one death logged twice once, newest first", () => {
  const log: ArenaLog = { matches: [], maps: {}, kills: [] };
  const k = (atMs: number, kind: "kill" | "death", id: number) => ({ atMs, kind, mapId: null, other: p(id, "opponent", 0) });
  assert.equal(logKills(log, [k(1_000, "kill", 3), k(5_000, "death", 4)]), 2);
  assert.equal(logKills(log, [k(1_000, "kill", 3), k(5_000, "death", 4), k(6_500, "death", 4)]), 0);
  assert.equal(logKills(log, [k(9_000, "kill", 3)]), 1);
  assert.deepEqual(log.kills.map((x) => [x.atMs, x.kind]), [[9_000, "kill"], [5_000, "death"], [1_000, "kill"]]);
});

test("map labels: the player's name, a known one, or Map <id>", () => {
  assert.equal(mapLabel({ 20: "Upper Abyss" }, 20), "Upper Abyss");
  assert.equal(mapLabel({}, 20), "Abyss");
  assert.equal(mapLabel({}, 1110), "Map 1110");
});

test("an arena's rounds, a map load each, are one match (the 1v1 of 2026-10-27: died once, Nocturna 3 times)", () => {
  const log: ArenaLog = { matches: [], maps: {}, kills: [] };
  const pl = (id: number, name: string, side: ArenaSide, dealt: number, taken: number, deaths: number, serverId = 0): ArenaPlayer =>
    ({ id, name, side, job: "Templar", serverId, dealt, taken, hits: 1, deaths, level: 45, gearScore: null, combatPower: null });
  const round1: ArenaMatch = { mapId: 61, startMs: 169_341, endMs: 226_299,
    players: [pl(13947, "Randronirk", "you", 76_002, 91_641, 1, 2318), pl(445, "Nocturna", "opponent", 91_641, 76_002, 1, 2316)] };
  const round2: ArenaMatch = { mapId: 61, startMs: 244_549, endMs: 300_624,
    players: [pl(14010, "Randronirk", "you", 91_058, 45_537, 0), pl(512, "Nocturna", "opponent", 45_537, 91_058, 2)] };
  assert.equal(logMatch(log, round1), true);
  assert.equal(logMatch(log, round2), true);
  assert.equal(logMatch(log, round2), false, "the meter resends the last round");
  assert.equal(log.matches.length, 1);
  const t = matchTotals(log.matches[0]);
  assert.deepEqual([t.ourDeaths, t.theirDeaths, t.dealt, t.taken], [1, 3, 167_060, 137_178]);
  assert.equal(t.ms, 56_958 + 56_075, "the rounds' time, not the pause between");
  assert.deepEqual(log.matches[0].rounds, [169_341, 244_549]);
  assert.equal(log.matches[0].players.find((p) => p.name === "Nocturna")?.serverId, 2316);
  // Another opponent, or long after: a new match.
  const other: ArenaMatch = { ...round2, startMs: 320_000, endMs: 380_000, players: [pl(9, "Ezio", "opponent", 1, 1, 0)] };
  assert.equal(logMatch(log, other), true);
  assert.equal(log.matches.length, 2);
});
