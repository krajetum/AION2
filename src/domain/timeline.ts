// A boss fight second by second: your damage sampled from the meter's updates (each carries the whole fight), kept
// on the Fight Log's record, and what it tells: the best burst, the opener, the seconds with no damage. Pure.
import type { Fight } from "./meter.ts";

/** Seconds kept: a fight left running for hours stops being sampled. */
export const MAX_SECONDS = 3600;

/**
 * Your damage so far into the slot of the fight's current second (`cum[s]` = the total as of the last update in
 * second s; seconds no update fell in repeat the one before). Start a new array when the fight ends.
 */
export function sample(cum: number[], f: Fight): number[] {
  if (!f.target?.isBoss) return cum;
  const s = Math.floor(f.battleTimeMs / 1000);
  if (s < 0 || s >= MAX_SECONDS) return cum;
  while (cum.length < s) cum.push(cum.at(-1) ?? 0);
  cum[s] = f.rows.find((r) => r.isYou)?.damage ?? cum.at(-1) ?? 0;
  return cum;
}

/** The samples as damage per second. */
export const perSecond = (cum: number[]): number[] => cum.map((v, i) => Math.max(0, v - (cum[i - 1] ?? 0)));

const sum = (t: number[]) => t.reduce((a, v) => a + v, 0);

/** The best `window` seconds in a row: their DPS and the second they start at; null for a shorter fight. */
export function burst(t: number[], window = 10): { dps: number; at: number } | null {
  if (t.length < window) return null;
  let run = sum(t.slice(0, window)), best = run, at = 0;
  for (let i = window; i < t.length; i++) {
    run += t[i] - t[i - window];
    if (run > best) { best = run; at = i - window + 1; }
  }
  return { dps: best / window, at };
}

/** DPS over the first `seconds` (the whole fight if shorter). */
export const opener = (t: number[], seconds = 15): number => (t.length ? sum(t.slice(0, seconds)) / Math.min(seconds, t.length) : 0);

/** Seconds with no damage of yours (dead, a mechanic, running), the longest stretch of them, and your DPS over the rest. */
export function downtime(t: number[]): { idle: number; longest: number; at: number; activeDps: number } {
  let idle = 0, longest = 0, at = 0, run = 0;
  t.forEach((v, i) => {
    run = v > 0 ? 0 : run + 1;
    if (!v) idle++;
    if (run > longest) { longest = run; at = i - run + 1; }
  });
  return { idle, longest, at, activeDps: sum(t) / Math.max(1, t.length - idle) };
}

/** A moving average over `window` seconds, for a line that reads as a trend rather than every hit. */
export function smooth(t: number[], window = 5): number[] {
  const h = Math.floor(window / 2);
  return t.map((_, i) => { const part = t.slice(Math.max(0, i - h), i + h + 1); return sum(part) / part.length; });
}
