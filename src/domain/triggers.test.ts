// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Fight, Kill, MeterUpdate } from "./meter.ts";
import { charFor, eventsFrom, matching, suggest, type MeterEvent } from "./triggers.ts";
import type { Task } from "./types.ts";

const fight = (name: string, ms: number, currentHp: number): Fight =>
  ({ target: { name, isBoss: true, maxHp: 100, currentHp, damageDealt: 100 }, targetMode: "bossTargets", battleTimeMs: ms, rows: [] });
const idle: Fight = { target: null, targetMode: "bossTargets", battleTimeMs: 0, rows: [] };
const kill = (atMs: number, kind: Kill["kind"] = "kill"): Kill => ({ atMs, kind, mapId: 1, other: {} as Kill["other"] });
const u = (o: Partial<MeterUpdate> = {}): MeterUpdate => ({ fight: idle, arena: null, position: null, kills: [], ...o } as MeterUpdate);
const at = (mapId: number | null) => ({ x: 0, y: 0, z: 0, mapId, atMs: 0 });
const kinds = (evs: MeterEvent[]) => evs.map((e) => JSON.stringify(e.trigger));
const task = (triggers: Task["triggers"], enabled = true): Task =>
  ({ id: "t", cadence: "weekly", category: "", name: "T", enabled, order: 0, triggers });

test("nothing from the first update", () => {
  assert.deepEqual(eventsFrom(undefined, u({ position: at(5) }), 0), []);
});

test("a map change is an entry; the same map or an unknown one is not", () => {
  assert.deepEqual(kinds(eventsFrom(u({ position: at(4) }), u({ position: at(5) }), 0)), ['{"kind":"map","mapId":5}']);
  assert.deepEqual(eventsFrom(u({ position: at(5) }), u({ position: at(5) }), 0), []);
  assert.deepEqual(eventsFrom(u({ position: at(5) }), u({ position: at(null) }), 0), []);
});

test("a boss fight that ends with the boss dead is a kill; alive is not", () => {
  assert.deepEqual(kinds(eventsFrom(u({ fight: fight("Tahabata", 60_000, 0) }), u(), 0)), ['{"kind":"boss","name":"Tahabata"}']);
  assert.deepEqual(eventsFrom(u({ fight: fight("Tahabata", 60_000, 30) }), u(), 0), []);
});

test("a new arena match, and new PvP kills only (not assists or deaths)", () => {
  const m = { mapId: 600501, startMs: 1, endMs: 2, players: [] };
  assert.deepEqual(kinds(eventsFrom(u(), u({ arena: m }), 0)), ['{"kind":"arena","mapId":600501}']);
  assert.deepEqual(eventsFrom(u({ arena: m }), u({ arena: m }), 0), []);
  const before = u({ kills: [kill(10)] });
  assert.deepEqual(kinds(eventsFrom(before, u({ kills: [kill(10), kill(20), kill(30, "assist"), kill(40)] }), 0)), ['{"kind":"pvp"}', '{"kind":"pvp"}']);
});

test("tasks match by trigger: boss by name in any case, maps by id, enabled only", () => {
  const ev: MeterEvent = { trigger: { kind: "boss", name: "tahabata" }, atMs: 0 };
  assert.equal(matching([task([{ kind: "boss", name: "Tahabata" }])], ev).length, 1);
  assert.equal(matching([task([{ kind: "boss", name: "Tahabata" }], false)], ev).length, 0);
  assert.equal(matching([task([{ kind: "map", mapId: 5 }])], { trigger: { kind: "map", mapId: 6 }, atMs: 0 }).length, 0);
});

test("suggestions: recent events, newest first, once each, not the task's own", () => {
  const recent: MeterEvent[] = [
    { trigger: { kind: "map", mapId: 1 }, atMs: 0 },          // too old
    { trigger: { kind: "map", mapId: 5 }, atMs: 700_000 },
    { trigger: { kind: "boss", name: "B" }, atMs: 800_000 },
    { trigger: { kind: "map", mapId: 5 }, atMs: 900_000 },
    { trigger: { kind: "map", mapId: 7 }, atMs: 950_000 },
  ];
  const got = suggest(recent, task([{ kind: "map", mapId: 7 }]), 1_000_000);
  assert.deepEqual(got, [{ kind: "map", mapId: 5 }, { kind: "boss", name: "B" }]);
});

test("the character played: by name, else the only one", () => {
  const a = { id: "a", name: "Main" }, b = { id: "b", name: "Alt" };
  assert.equal(charFor([a, b], "alt")?.id, "b");
  assert.equal(charFor([a, b], "Other"), undefined);
  assert.equal(charFor([a], "Other")?.id, "a");
});
