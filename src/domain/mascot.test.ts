import assert from "node:assert/strict";
import { test } from "node:test";
import { animOf, ANIMS, countShakes, cueOf, frameAt, grab, mood, newBody, release, RIFT_MS, sheetFor, SHEET_COLS, SHEET_ROWS, step, throwVelocity, type Body } from "./mascot.ts";

const T = 1_000_000;

test("the sheet: class, gender and the server's faction", () => {
  assert.equal(sheetFor("Gladiator", "m", 1304), "gladiator-m-elyos");
  assert.equal(sheetFor("spiritmaster", "f", 2318), "spiritmaster-f-asmo");
  assert.equal(sheetFor("Cleric", "f", 0), "cleric-f-elyos"); // faction unknown: white wings
  assert.equal(sheetFor("Brawler", "m", 1304), null); // no mascot drawn for it
  assert.equal(SHEET_COLS, 6);
  assert.equal(SHEET_ROWS, 11);
});

test("frames loop, the landing stops on its last", () => {
  assert.equal(frameAt("walk", 0), 0);
  assert.equal(frameAt("walk", 1000 / 8 * 7), 1);
  assert.equal(frameAt("land", 10_000), ANIMS.land.frames - 1);
});

test("cues: the rift's alert, other alerts shout, the rest nothing", () => {
  assert.equal(cueOf(["rift", "event"]), "rift");
  assert.equal(cueOf(["shugo", "event"]), "shout");
  assert.equal(cueOf(["gartua", "boss", "event"]), "shout");
  assert.equal(cueOf(["boss", "event"]), "shout");
  assert.equal(cueOf(["reset"]), null);
  assert.equal(cueOf(["auto", "check"]), null);
});

test("mood: shout, then a cube opened, then the rift for 10 minutes, then a cube in view", () => {
  const base = { now: T, cues: [], cubeInView: false, lastOpened: null };
  assert.equal(mood(base), null);
  assert.equal(mood({ ...base, cubeInView: true }), "happy");
  assert.equal(mood({ ...base, cues: [{ kind: "rift", atMs: T - 60_000 }], cubeInView: true }), "rift");
  assert.equal(mood({ ...base, cues: [{ kind: "rift", atMs: T - RIFT_MS }] }), null);
  assert.equal(mood({ ...base, lastOpened: { byYou: true, atMs: T - 1000 }, cues: [{ kind: "rift", atMs: T }] }), "celebrate");
  assert.equal(mood({ ...base, lastOpened: { byYou: false, atMs: T - 1000 } }), "sad");
  assert.equal(mood({ ...base, lastOpened: { byYou: false, atMs: T - 6000 } }), null);
  assert.equal(mood({ ...base, cues: [{ kind: "shout", atMs: T - 1000 }], lastOpened: { byYou: true, atMs: T } }), "shout");
  assert.equal(mood({ ...base, cues: [{ kind: "shout", atMs: T + 5000 }] }), null); // a cue from the future (clock change)
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
