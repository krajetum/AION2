// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { logMatch, matchTotals, MAX_MATCHES, type ArenaLog } from "./arena.ts";
import type { ArenaMatch, ArenaPlayer, ArenaSide } from "./meter.ts";

const p = (id: number, side: ArenaSide, dealt: number, deaths = 0): ArenaPlayer =>
  ({ id, name: `P${id}`, side, job: "", serverId: 0, dealt, taken: 0, hits: 1, deaths, level: null, gearScore: null, combatPower: null });
const m = (startMs: number, players: ArenaPlayer[] = []): ArenaMatch => ({ mapId: 7, startMs, endMs: startMs + 90_000, players });

test("the resent last match is logged once, newest first, capped", () => {
  const log: ArenaLog = { matches: [], maps: {} };
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
