// The mascot: a little pixel character of your class (public/mascots/, drawn by scripts/mascots.py) walking along the
// bottom of the companion's window. What it does: its mood from what the app knows (alerts, cubes, the rift), and the
// physics of walking, being dragged, thrown and shaken. Pure: the Svelte part (ui/parts/Mascot.svelte) draws it.
import { faction } from "./servers.ts";

/** One frame of a sheet, px. */
export const FRAME = 48;
/** Each animation's row in the sheet, frame count and speed (frames per second). Must match scripts/mascots.py ORDER. */
export const ANIMS = {
  idle: { row: 0, frames: 4, fps: 4 },
  walk: { row: 1, frames: 6, fps: 8 },
  shout: { row: 2, frames: 4, fps: 9 },
  happy: { row: 3, frames: 6, fps: 10 },
  celebrate: { row: 4, frames: 6, fps: 8 },
  sad: { row: 5, frames: 4, fps: 3 },
  held: { row: 6, frames: 4, fps: 6 },
  thrown: { row: 7, frames: 4, fps: 12 },
  dizzy: { row: 8, frames: 4, fps: 6 },
  land: { row: 9, frames: 3, fps: 8 },
  rift: { row: 10, frames: 4, fps: 10 },
} as const;
export type Anim = keyof typeof ANIMS;
export const SHEET_COLS = Math.max(...Object.values(ANIMS).map((a) => a.frames));
export const SHEET_ROWS = Object.keys(ANIMS).length;

/** The frame of an animation at a time since it started: loops, except `land` which stops on its last frame. */
export function frameAt(anim: Anim, ms: number): number {
  const a = ANIMS[anim], i = Math.floor(Math.max(0, ms) / 1000 * a.fps);
  return anim === "land" ? Math.min(i, a.frames - 1) : i % a.frames;
}

export const CLASSES = ["Assassin", "Gladiator", "Templar", "Ranger", "Sorcerer", "Spiritmaster", "Cleric", "Chanter"];
export type Gender = "m" | "f";

/** The sheet for a class (as the meter names it), gender and server: white wings for Elyos, black for Asmodians.
 *  null for a class without a mascot (none drawn yet). An unknown faction gets white wings. */
export function sheetFor(job: string, gender: Gender, serverId: number): string | null {
  const cls = CLASSES.find((c) => c.toLowerCase() === job.trim().toLowerCase());
  if (!cls) return null;
  return `${cls.toLowerCase()}-${gender}-${faction(serverId) === "Asmodian" ? "asmo" : "elyos"}`;
}

// --- mood: what the app tells it ---------------------------------------------------------------------------------

/** How long it shouts after an alert, clings on after the rift's alert, and cheers or sulks after a cube is opened. */
export const SHOUT_MS = 4_000;
export const RIFT_MS = 10 * 60_000;
export const CUBE_MS = 5_000;

export type Cue = { kind: "shout" | "rift"; atMs: number };
/** The cue an alert's sound gives (its channel first): the rift's alert → rift, other event and field-boss alerts → shout. */
export function cueOf(sound: string[]): Cue["kind"] | null {
  if (sound[0] === "rift") return "rift";
  return sound.includes("event") || sound.includes("boss") ? "shout" : null;
}

export interface MoodInput {
  now: number;
  cues: Cue[];
  cubeInView: boolean;
  lastOpened: { byYou: boolean; atMs: number } | null;
}
/** What it is doing because of the game, most important first; null = free to wander. */
export function mood(m: MoodInput): Anim | null {
  const since = (k: Cue["kind"]) => Math.min(...m.cues.filter((c) => c.kind === k).map((c) => m.now - c.atMs).filter((d) => d >= 0), Infinity);
  if (since("shout") < SHOUT_MS) return "shout";
  if (m.lastOpened && m.now - m.lastOpened.atMs >= 0 && m.now - m.lastOpened.atMs < CUBE_MS) return m.lastOpened.byYou ? "celebrate" : "sad";
  if (since("rift") < RIFT_MS) return "rift";
  if (m.cubeInView) return "happy";
  return null;
}

// --- body: walking, dragged, thrown, shaken ----------------------------------------------------------------------

/** Where it is: x = its left edge, y = height above the floor (px, up), velocities px/s. */
export interface Body {
  x: number; y: number; vx: number; vy: number;
  dir: 1 | -1; // facing right / left
  state: "idle" | "walk" | "held" | "air" | "land" | "dizzy";
  until: number; // ms timestamp the idle, land or dizzy state ends
  target: number; // where a walk goes
  dizzy: boolean; // shaken while held: dizzy once it lands
}
export const GRAVITY = 1800; // px/s²
export const WALK_SPEED = 32; // px/s
const MAX_THROW = 1600; // px/s
const BOUNCE = 0.55;

export const newBody = (x: number, now: number): Body =>
  ({ x, y: 260, vx: 0, vy: 0, dir: 1, state: "air", until: now, target: x, dizzy: false }); // drops in from above

/** One step of `dt` seconds in a stage `width` × `height` px for a mascot `size` px wide. `rand` ∈ [0, 1). */
export function step(b: Body, dt: number, now: number, width: number, height: number, size: number, rand: () => number): Body {
  const maxX = Math.max(0, width - size), maxY = Math.max(0, height - size);
  const n = { ...b };
  if (n.state === "held") return n;
  if (n.state === "air") {
    n.vy -= GRAVITY * dt;
    n.x += n.vx * dt; n.y += n.vy * dt;
    if (n.x < 0) { n.x = 0; n.vx = -n.vx * BOUNCE; }
    if (n.x > maxX) { n.x = maxX; n.vx = -n.vx * BOUNCE; }
    if (n.y > maxY) { n.y = maxY; n.vy = -Math.abs(n.vy) * BOUNCE; }
    if (n.y <= 0) {
      n.y = 0; n.vx = 0; n.vy = 0;
      n.state = "land"; n.until = now + 400;
      if (Math.abs(b.vx) > 1) n.dir = b.vx > 0 ? 1 : -1;
    }
    return n;
  }
  n.x = Math.min(maxX, Math.max(0, n.x));
  if (n.state === "land" && now >= n.until) {
    if (n.dizzy) { n.state = "dizzy"; n.until = now + 2_500; n.dizzy = false; }
    else { n.state = "idle"; n.until = now + 1_000 + rand() * 2_000; }
  } else if (n.state === "dizzy" && now >= n.until) {
    n.state = "idle"; n.until = now + 1_500;
  } else if (n.state === "idle" && now >= n.until) {
    if (rand() < 0.65) { n.state = "walk"; n.target = rand() * maxX; n.dir = n.target >= n.x ? 1 : -1; }
    else n.until = now + 2_000 + rand() * 4_000;
  } else if (n.state === "walk") {
    const d = n.target - n.x, move = WALK_SPEED * dt;
    if (Math.abs(d) <= move) { n.x = n.target; n.state = "idle"; n.until = now + 2_000 + rand() * 5_000; }
    else { n.dir = d > 0 ? 1 : -1; n.x += n.dir * move; }
  }
  return n;
}

/** Picked up by the pointer. */
export const grab = (b: Body): Body => ({ ...b, state: "held", vx: 0, vy: 0, dizzy: false });

/** Let go with the pointer's velocity (px/s, y up) after `shakes` direction changes: thrown, or dropped. */
export function release(b: Body, vx: number, vy: number, shakes: number, now: number): Body {
  const cap = (v: number) => Math.max(-MAX_THROW, Math.min(MAX_THROW, v));
  return { ...b, state: "air", vx: cap(vx), vy: cap(vy), dizzy: shakes >= SHAKES_DIZZY, until: now };
}

/** A pointer sample while held: time (ms) and x (px). */
export interface Sample { t: number; x: number; y: number }
export const SHAKES_DIZZY = 4;
/** Quick back-and-forth moves in the last second: horizontal direction changes, each after at least 12 px. */
export function countShakes(samples: Sample[], now: number): number {
  const s = samples.filter((p) => now - p.t <= 1_000);
  let count = 0, dir = 0, from = s[0]?.x ?? 0;
  for (const p of s) {
    const d = p.x - from;
    if (Math.abs(d) < 12) continue;
    const nd = Math.sign(d);
    if (dir && nd !== dir) count++;
    dir = nd; from = p.x;
  }
  return count;
}

/** The pointer's velocity over its last 100 ms (px/s; y up, the screen's y goes down). */
export function throwVelocity(samples: Sample[]): { vx: number; vy: number } {
  const last = samples.at(-1);
  if (!last) return { vx: 0, vy: 0 };
  const first = samples.find((p) => last.t - p.t <= 100) ?? last;
  const dt = (last.t - first.t) / 1000;
  return dt > 0 ? { vx: (last.x - first.x) / dt, vy: -(last.y - first.y) / dt } : { vx: 0, vy: 0 };
}

/** The animation for the body and the mood: being handled wins, then the game's mood, then walking about. */
export function animOf(b: Body, m: Anim | null): Anim {
  if (b.state === "held") return "held";
  if (b.state === "air") return "thrown";
  if (b.state === "land") return "land";
  if (b.state === "dizzy") return "dizzy";
  return m ?? (b.state === "walk" ? "walk" : "idle");
}
