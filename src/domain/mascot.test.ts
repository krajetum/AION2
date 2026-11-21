import assert from "node:assert/strict";
import { test } from "node:test";
import { EVENTS } from "../config.ts";
import { animOf, ANIMS, asleep, SLEEP_MS, countShakes, cueOf, eventsNow, FIGHT_MS, frameAt, grab, lastStart, mood, newBody, release, sheetFor, SHEET_COLS, SHEET_ROWS, step, throwVelocity, type Body } from "./mascot.ts";

const T = 1_000_000;

test("the sheet: class, gender and the server's faction", () => {
  assert.equal(sheetFor("Gladiator", "m", 1304), "gladiator-m-elyos");
  assert.equal(sheetFor("spiritmaster", "f", 2318), "spiritmaster-f-asmo");
  assert.equal(sheetFor("Cleric", "f", 0), "cleric-f-elyos"); // faction unknown: white wings
  assert.equal(sheetFor("Brawler", "m", 1304), null); // no mascot drawn for it
  assert.equal(SHEET_COLS, 6);
  assert.equal(SHEET_ROWS, 12);
});

test("frames loop, the landing stops on its last", () => {
  assert.equal(frameAt("walk", 0), 0);
  assert.equal(frameAt("walk", 1000 / 8 * 7), 1);
  assert.equal(frameAt("land", 10_000), ANIMS.land.frames - 1);
});

test("cues: event and boss alerts shout, the rest nothing", () => {
  assert.equal(cueOf(["rift", "event"]), "shout");
  assert.equal(cueOf(["shugo", "event"]), "shout");
  assert.equal(cueOf(["gartua", "boss", "event"]), "shout");
  assert.equal(cueOf(["boss", "event"]), "shout");
  assert.equal(cueOf(["reset"]), null);
  assert.equal(cueOf(["auto", "check"]), null);
});

test("mood: shout, then a cube opened, then the rift, then the invasion's fight, then a cube in view", () => {
  const base = { now: T, cues: [], cubeInView: false, lastOpened: null };
  const rift = { rift: true, fight: false }, fight = { rift: false, fight: true };
  assert.equal(mood(base), null);
  assert.equal(mood({ ...base, cubeInView: true }), "happy");
  assert.equal(mood({ ...base, events: rift, cubeInView: true }), "rift");
  assert.equal(mood({ ...base, events: fight, cubeInView: true }), "fight");
  assert.equal(mood({ ...base, events: { rift: true, fight: true } }), "rift");
  assert.equal(mood({ ...base, lastOpened: { byYou: true, atMs: T - 1000 }, events: rift }), "celebrate");
  assert.equal(mood({ ...base, lastOpened: { byYou: false, atMs: T - 1000 } }), "sad");
  assert.equal(mood({ ...base, lastOpened: { byYou: false, atMs: T - 6000 } }), null);
  assert.equal(mood({ ...base, cues: [{ kind: "shout", atMs: T - 1000 }], lastOpened: { byYou: true, atMs: T } }), "shout");
  assert.equal(mood({ ...base, cues: [{ kind: "shout", atMs: T + 5000 }] }), null); // a cue from the future (clock change)
  // The app's own moments: a cheer or a sulk for 5 s, over the rift.
  assert.equal(mood({ ...base, events: rift, cues: [{ kind: "cheer", atMs: T - 1000 }] }), "celebrate");
  assert.equal(mood({ ...base, cues: [{ kind: "sulk", atMs: T - 1000 }] }), "sad");
  assert.equal(mood({ ...base, cues: [{ kind: "cheer", atMs: T - 6000 }] }), null);
  // It dozes off after 5 quiet minutes on the ground, never with something going on or in the air.
  const idle = { ...newBody(0, T), state: "idle" as const };
  assert.equal(asleep(idle, null, T, T - SLEEP_MS), true);
  assert.equal(asleep(idle, null, T, T - SLEEP_MS + 1), false);
  assert.equal(asleep(idle, "happy", T, 0), false);
  assert.equal(asleep(newBody(0, T), null, T, 0), false);
});

const W = 800, H = 300, SIZE = 96;
const run = (b: Body, ms: number, rand = () => 0.5) => {
  let t = T;
  for (let i = 0; i < ms / 16; i++) { t += 16; b = step(b, 0.016, t, W, H, SIZE, rand); }
  return { b, t };
};

test("it drops in, lands, then walks within the stage", () => {
  const { b } = run(newBody(100, T), 1000);
  assert.equal(b.y, 0);
  assert.ok(["land", "idle", "walk"].includes(b.state));
  const later = run(b, 20_000, () => 0.3).b;
  assert.ok(later.x >= 0 && later.x <= W - SIZE);
});

test("thrown: bounces off the walls, lands, dizzy if it was shaken", () => {
  let b = release(grab(newBody(100, T)), 3000, 800, 0, T);
  assert.equal(b.vx, 1600); // capped
  b = run(b, 3000).b;
  assert.ok(b.x >= 0 && b.x <= W - SIZE);
  assert.equal(b.y, 0);
  const shaken = run(release({ ...grab(newBody(100, T)), y: 50 }, 0, 0, 5, T), 800).b;
  assert.equal(shaken.state, "dizzy");
  assert.equal(animOf(shaken, "happy"), "dizzy"); // being handled wins over the mood
});

test("shakes and throw speed from the pointer's samples", () => {
  const s = [0, 20, 40, 60, 80, 100].map((t, i) => ({ t: T + t, x: i % 2 ? 40 : 0, y: 0 }));
  assert.equal(countShakes(s, T + 100), 4);
  assert.equal(countShakes([{ t: T, x: 0, y: 0 }, { t: T + 50, x: 5, y: 0 }, { t: T + 90, x: 0, y: 0 }], T + 90), 0); // tiny jitter
  const v = throwVelocity([{ t: T, x: 0, y: 100 }, { t: T + 50, x: 50, y: 50 }, { t: T + 100, x: 100, y: 0 }]);
  assert.deepEqual(v, { vx: 1000, vy: 1000 });
});

test("animation: handling, then the mood, then walking", () => {
  const b = newBody(0, T);
  assert.equal(animOf({ ...b, state: "held" }, "shout"), "held");
  assert.equal(animOf({ ...b, state: "walk" }, null), "walk");
  assert.equal(animOf({ ...b, state: "walk" }, "rift"), "rift");
  assert.equal(animOf({ ...b, state: "idle" }, null), "idle");
});

test("events: the rift while it is open, the invasion's first 3 minutes, the festival's first 3 minutes", () => {
  const Z = "Europe/Paris";
  const at = (h: number, m: number, s = 0) => Date.UTC(2026, 10, 21, h - 1, m, s); // Paris = UTC+1 in November
  // Rift at 02:00, 05:00 … Paris (config), open `duration` minutes.
  const rift = EVENTS.find((e) => e.id === "rift")!;
  assert.equal(lastStart(rift, at(20, 4), Z), at(20, 0));
  assert.equal(lastStart(rift, at(20, 0), Z), at(20, 0));
  assert.equal(eventsNow(at(20, 0), Z).rift, true);
  assert.equal(eventsNow(at(20, rift.duration - 1, 59), Z).rift, true);
  assert.equal(eventsNow(at(20, rift.duration), Z).rift, false);
  assert.equal(eventsNow(at(19, 59), Z).rift, false);
  // Invasion at :30, Shugo at :00 every hour (config, reset zone).
  const inv = EVENTS.find((e) => e.id === "invasion")!, shugo = EVENTS.find((e) => e.id === "shugo")!;
  const t0 = lastStart(inv, at(15, 40), Z);
  assert.equal(eventsNow(t0 + FIGHT_MS - 1, Z).fight, true);
  assert.equal(eventsNow(t0 + FIGHT_MS, Z).fight, false);
  const s0 = lastStart(shugo, at(15, 40), Z);
  assert.equal(eventsNow(s0 + 1000, Z).festival, true);
  assert.equal(eventsNow(s0 + 3 * 60_000, Z).festival, false);
});
