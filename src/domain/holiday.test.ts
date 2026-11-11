// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { JOKES } from "./advent.ts";
import { ADVENT_DAYS, adventToday, canOpen, cleanAdvent, emptyAdvent, lastOpenable, newYearShow, openDoor, openedNow, winterActive, winterYear } from "./holiday.ts";

// Local time, as the app uses it.
const at = (y: number, m: number, d: number, h = 0, min = 0, s = 0) => new Date(y, m - 1, d, h, min, s).getTime();

test("the theme is on from 1 December 00:00 to 6 January 23:59, local time", () => {
  assert.equal(winterActive(at(2026, 11, 30, 23, 59, 59)), false);
  assert.equal(winterActive(at(2026, 12, 1)), true);
  assert.equal(winterActive(at(2027, 1, 6, 23, 59, 59)), true);
  assert.equal(winterActive(at(2027, 1, 7)), false);
  assert.equal(winterActive(at(2027, 7, 1)), false);
});

test("December and early January are the same season", () => {
  assert.equal(winterYear(at(2026, 12, 31, 23, 59)), 2026);
  assert.equal(winterYear(at(2027, 1, 1)), 2026);
  assert.equal(winterYear(at(2027, 1, 3)), 2026);
});

test("only today's door and the ones before it open; all of them after the 24th", () => {
  const d12 = at(2026, 12, 12, 10);
  assert.equal(lastOpenable(d12), 12);
  assert.equal(canOpen(12, d12), true);
  assert.equal(canOpen(13, d12), false);
  assert.equal(canOpen(0, d12), false);
  assert.equal(canOpen(1.5, d12), false);
  assert.equal(lastOpenable(at(2026, 12, 28)), ADVENT_DAYS);
  assert.equal(lastOpenable(at(2027, 1, 5)), ADVENT_DAYS);
  assert.equal(lastOpenable(at(2026, 11, 30)), 0);
  assert.equal(adventToday(d12), 12);
  assert.equal(adventToday(at(2026, 12, 25)), null);
  assert.equal(adventToday(at(2027, 1, 2)), null);
});

test("a door opens once, sorted, and not before its day", () => {
  const now = at(2026, 12, 10, 9);
  let a = openDoor(emptyAdvent(), 7, now);
  a = openDoor(a, 3, now);
  assert.deepEqual(a, { year: 2026, opened: [3, 7] });
  assert.equal(openDoor(a, 7, now), a);
  assert.equal(openDoor(a, 11, now), a);
  assert.equal(openDoor(a, 1, at(2026, 11, 30)), a);
});

test("a new season starts with every door closed", () => {
  const last = { year: 2025, opened: [1, 2, 3] };
  assert.deepEqual(openedNow(last, at(2026, 12, 4)), []);
  assert.deepEqual(openDoor(last, 4, at(2026, 12, 4)), { year: 2026, opened: [4] });
  assert.deepEqual(openedNow({ year: 2026, opened: [5] }, at(2027, 1, 2)), [5]);
});

test("old or imported saves are cleaned", () => {
  assert.deepEqual(cleanAdvent(undefined), emptyAdvent());
  assert.deepEqual(cleanAdvent({ year: 2026, opened: [3, 3, 0, 25, "x", 1] }), { year: 2026, opened: [1, 3] });
});

test("fireworks during the first minute of the year only", () => {
  assert.equal(newYearShow(at(2026, 12, 31, 23, 59, 59)), false);
  assert.equal(newYearShow(at(2027, 1, 1, 0, 0, 0)), true);
  assert.equal(newYearShow(at(2027, 1, 1, 0, 0, 59)), true);
  assert.equal(newYearShow(at(2027, 1, 1, 0, 1, 0)), false);
});

test("one credited joke per door", () => {
  assert.equal(JOKES.length, ADVENT_DAYS);
  for (const k of JOKES) assert.ok(k.setup && k.punchline && k.credit);
  assert.equal(new Set(JOKES.map((k) => k.setup)).size, ADVENT_DAYS);
});
