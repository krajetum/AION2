// Auto-tracked tasks: what the meter saw (a map entered, a boss killed, an arena match finished, a PvP kill) as
// events, and the tasks whose triggers they fire. Pure; the ticks themselves are src/app/auto.ts.
import { mapLabel } from "./arena.ts";
import { fightEnded } from "./fights.ts";
import { hpLeft, sameName, type MeterUpdate } from "./meter.ts";
import type { Character, Task } from "./types.ts";

export type Trigger = { kind: "map" | "arena"; mapId: number } | { kind: "boss"; name: string } | { kind: "pvp" };
export interface MeterEvent { trigger: Trigger; atMs: number }

/** Events from one update to the next. Nothing from the first update: the app may start long after you entered a map. */
export function eventsFrom(prev: MeterUpdate | undefined, next: MeterUpdate, now: number): MeterEvent[] {
  if (!prev) return [];
  const out: MeterEvent[] = [];
  const add = (trigger: Trigger) => out.push({ trigger, atMs: now });
  const map = next.position?.mapId;
  if (map != null && map !== prev.position?.mapId) add({ kind: "map", mapId: map });
  if (fightEnded(prev.fight, next.fight) && hpLeft(prev.fight.target!) === 0) add({ kind: "boss", name: prev.fight.target!.name });
  const a = next.arena, b = prev.arena;
  if (a && (!b || a.mapId !== b.mapId || a.startMs !== b.startMs)) add({ kind: "arena", mapId: a.mapId });
  const since = Math.max(0, ...(prev.kills ?? []).map((k) => k.atMs));
  for (const k of next.kills ?? []) if (k.kind === "kill" && k.atMs > since) add({ kind: "pvp" });
  return out;
}

export function sameTrigger(a: Trigger, b: Trigger) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "boss") return sameName(a.name, (b as typeof a).name);
  return a.kind === "pvp" || a.mapId === (b as typeof a).mapId;
}

/** The enabled tasks an event ticks. */
export const matching = (tasks: Task[], ev: MeterEvent) =>
  tasks.filter((t) => t.enabled && t.triggers?.some((x) => sameTrigger(x, ev.trigger)));

/** Re-entering a map (a death, a teleport back) within this time counts once. */
export const REENTRY_MS = 10 * 60_000;
/** The events offered as a trigger after a manual tick: this recent. */
export const SUGGEST_MS = 10 * 60_000;

/** Recent events as trigger suggestions: newest first, one per trigger, without the ones the task already has. */
export function suggest(recent: MeterEvent[], task: Task, now: number): Trigger[] {
  const out: Trigger[] = [];
  for (const ev of [...recent].reverse()) {
    if (now - ev.atMs > SUGGEST_MS) break;
    if (![...out, ...(task.triggers ?? [])].some((x) => sameTrigger(x, ev.trigger))) out.push(ev.trigger);
  }
  return out;
}

/** The app's character played in game: same name, else the only one there is. */
export function charFor(chars: Character[], playing: string | undefined) {
  return (playing && chars.find((c) => sameName(c.name, playing))) || (chars.length === 1 ? chars[0] : undefined);
}

export function triggerLabel(t: Trigger, maps: Record<string, string>) {
  if (t.kind === "boss") return `Kill ${t.name}`;
  if (t.kind === "pvp") return "A PvP kill";
  return t.kind === "map" ? `Enter ${mapLabel(maps, t.mapId)}` : `Arena match on ${mapLabel(maps, t.mapId)}`;
}
