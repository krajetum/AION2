// The Fight Log: boss fights kept after the meter resets them, personal bests per boss, and two runs side by side.
// Pure; the fights live in their own file (src/infra/fights.ts), not in the save file.
import { clock, displayName, hpLeft, short, type Fight, type PlayerRow, type Profile, type SkillRow } from "./meter.ts";

/** A boss fight shorter than this is not kept (a pull reset, a stray hit). */
export const MIN_FIGHT_MS = 10_000;
/** Fights kept, newest first; personal bests are kept past it. */
export const MAX_FIGHTS = 500;

export interface FightRecord {
  id: string;
  endMs: number;
  battleTimeMs: number;
  boss: string;
  maxHp: number;
  killed: boolean;
  mapId: number | null;
  char: string; // who you played, as the game said ("" when not known)
  gearScore: number | null;
  combatPower: number | null;
  rows: PlayerRow[]; // as the meter had them at the end: skills for you (and the rows open on the DPS page)
}

/** The boss fight the meter had (`prev`) is over in `next`: its time went back (idle reset, Reset button) or its target changed. */
export function fightEnded(prev: Fight | undefined, next: Fight): prev is Fight {
  if (!prev?.target?.isBoss || prev.battleTimeMs < MIN_FIGHT_MS) return false;
  return next.battleTimeMs < prev.battleTimeMs || next.target?.name !== prev.target.name;
}

export function toRecord(f: Fight, profile: Profile | null | undefined, mapId: number | null, now: number): FightRecord {
  const t = f.target!;
  return {
    id: `${now}:${t.name}`, endMs: now, battleTimeMs: f.battleTimeMs, boss: t.name || "Unknown boss", maxHp: t.maxHp,
    killed: hpLeft(t) === 0, mapId, char: profile?.name ?? "", gearScore: profile?.gearScore ?? null,
    combatPower: profile?.combatPower ?? null, rows: f.rows,
  };
}

export const you = (r: FightRecord) => r.rows.find((x) => x.isYou);
/** Your DPS in a fight, 0 when you are not in it. */
export const yourDps = (r: FightRecord) => you(r)?.dps ?? 0;

export interface Best { fights: number; kills: number; dps?: FightRecord; fastest?: FightRecord }

/** Per boss: your best DPS and your fastest kill. */
export function personalBests(log: FightRecord[]): Record<string, Best> {
  const out: Record<string, Best> = {};
  for (const f of log) {
    const b = (out[f.boss] ??= { fights: 0, kills: 0 });
    b.fights++;
    if (yourDps(f) > 0 && (!b.dps || yourDps(f) > yourDps(b.dps))) b.dps = f;
    if (f.killed) { b.kills++; if (!b.fastest || f.battleTimeMs < b.fastest.battleTimeMs) b.fastest = f; }
  }
  return out;
}

/** A new fight into the log: newest first, the oldest dropped past MAX_FIGHTS unless it is a personal best. */
export function addFight(log: FightRecord[], r: FightRecord): FightRecord[] {
  const all = [r, ...log];
  if (all.length <= MAX_FIGHTS) return all;
  const best = new Set(Object.values(personalBests(all)).flatMap((b) => [b.dps?.id, b.fastest?.id]));
  return all.filter((f, i) => i < MAX_FIGHTS || best.has(f.id));
}

export interface SkillDiff { name: string; icon: string | null; dot: boolean; a?: SkillRow; b?: SkillRow; dpsA: number; dpsB: number }

/** Your skills in two fights, matched by name, by damage per second (the runs differ in length), biggest first. */
export function compareSkills(a: FightRecord, b: FightRecord): SkillDiff[] {
  const per = (s: SkillRow | undefined, f: FightRecord) => (s ? s.damage / Math.max(1, f.battleTimeMs / 1000) : 0);
  const sa = you(a)?.skills ?? [], sb = you(b)?.skills ?? [];
  const names = [...new Set([...sa, ...sb].map((s) => s.name))];
  return names.map((name) => {
    const x = sa.find((s) => s.name === name), y = sb.find((s) => s.name === name);
    const s = (x ?? y)!;
    return { name, icon: s.icon, dot: s.dot, a: x, b: y, dpsA: per(x, a), dpsB: per(y, b) };
  }).sort((p, q) => Math.max(q.dpsA, q.dpsB) - Math.max(p.dpsA, p.dpsB));
}

/** A fight as plain text, to paste in a chat. */
export function fightText(r: FightRecord): string {
  const head = `${r.boss} · ${clock(r.battleTimeMs)}${r.killed ? " · killed" : ""} · ${new Date(r.endMs).toLocaleString()}`;
  const rows = [...r.rows].sort((p, q) => q.damage - p.damage)
    .map((p, i) => `${i + 1}. ${displayName(p)}${p.job ? ` (${p.job})` : ""}  ${short(p.dps)}/s  ${p.share.toFixed(1)}%`);
  return [head, ...rows].join("\n");
}
