// Players › Compare: two characters side by side (their official profiles, src/domain/armory.ts), each number with the
// difference. Pure.
import { addLines, type Board, type Equipment, type ItemDetail, type Piece, type Profile, type Skill, type StatLine } from "./armory.ts";
import { gearStats, type GearStat } from "./gearstats.ts";

/** One row: the name, each side's value (null = the side has none) and a − b: how far the first is ahead. `pct` = a percent value. */
export interface DiffRow { key: string; name: string; a: number | null; b: number | null; diff: number; pct: boolean }

const round = (n: number) => Math.round(n * 100) / 100;

/** Rows of two lists by key, in a's order then b's own; the difference counts a missing side as 0. */
export function diffRows(a: { key: string; name: string; value: number; pct?: boolean }[], b: { key: string; name: string; value: number; pct?: boolean }[]): DiffRow[] {
  const out = new Map<string, DiffRow>();
  for (const r of a) out.set(r.key, { key: r.key, name: r.name, a: r.value, b: null, diff: 0, pct: !!r.pct });
  for (const r of b) {
    const had = out.get(r.key);
    if (had) had.b = r.value;
    else out.set(r.key, { key: r.key, name: r.name, a: null, b: r.value, diff: 0, pct: !!r.pct });
  }
  return [...out.values()].map((r) => ({ ...r, diff: round((r.a ?? 0) - (r.b ?? 0)) }));
}

export const profileRows = (a: Profile, b: Profile) => diffRows(
  [["cp", "Combat power", a.combatPower], ["il", "Item level", a.itemLevel], ["lv", "Level", a.level]].filter((x) => x[2] != null).map(([key, name, value]) => ({ key: key as string, name: name as string, value: value as number })),
  [["cp", "Combat power", b.combatPower], ["il", "Item level", b.itemLevel], ["lv", "Level", b.level]].filter((x) => x[2] != null).map(([key, name, value]) => ({ key: key as string, name: name as string, value: value as number })));

/** The profile's primary and god stats (Might… Space). */
export const statRows = (a: Profile, b: Profile) =>
  diffRows((a.stats ?? []).map((s) => ({ key: s.name, name: s.name, value: s.value })), (b.stats ?? []).map((s) => ({ key: s.name, name: s.name, value: s.value })));

const gearList = (s: GearStat[]) => s.map((g) => ({ key: g.key, name: g.name, value: g.value, pct: g.pct }));
export type Pieces = { piece: Piece; detail: ItemDetail | null | undefined }[];
export const gearRows = (a: Pieces, b: Pieces) => diffRows(gearList(gearStats(a)), gearList(gearStats(b)));

const lineList = (l: StatLine[]) => l.map((x) => ({ key: `${x.name}|${x.pct}`, name: x.name, value: x.value, pct: x.pct }));
/** Daevanion: all boards' stats (and skill levels) added up, each side. */
export const boardRows = (a: (Board | null)[], b: (Board | null)[], what: "stats" | "skills" = "stats") =>
  diffRows(lineList(addLines(a.map((x) => x?.[what] ?? []))), lineList(addLines(b.map((x) => x?.[what] ?? []))));

/** Skill levels by name (actives, passives, stigma), 0 = not learned. */
export function skillRows(a: Equipment, b: Equipment): DiffRow[] {
  const list = (e: Equipment) => [...e.active, ...e.passive, ...e.stigma].map((s: Skill) => ({ key: s.name, name: s.name, value: s.level }));
  return diffRows(list(a), list(b));
}

/** Equipment slot by slot: each side's piece there (gear, accessories, arcana), in slot order. */
export interface SlotPair { slot: string; a: Piece | null; b: Piece | null }
export function slotPairs(a: Equipment, b: Equipment): SlotPair[] {
  const all = (e: Equipment) => [...e.gear, ...e.accessories, ...e.arcana];
  const out = new Map<string, SlotPair & { order: number }>();
  for (const p of all(a)) out.set(p.slotName, { slot: p.slotName, a: p, b: null, order: p.slot });
  for (const p of all(b)) {
    const had = out.get(p.slotName);
    if (had) had.b = p;
    else out.set(p.slotName, { slot: p.slotName, a: null, b: p, order: p.slot });
  }
  return [...out.values()].sort((x, y) => x.order - y.order).map(({ slot, a, b }) => ({ slot, a, b }));
}

/** A piece as one line: "+15 Enraged Kromede Sword" (enchant, then the levels past the cap). */
export const pieceText = (p: Piece | null) => (p ? `${p.enchant ? `+${p.enchant}` : ""}${p.exceed ? `(+${p.exceed})` : ""} ${p.name}`.trim() : "—");
/** A piece's enchant with the levels past the cap, to compare: +15 and 2 past = 17. */
export const pieceLevel = (p: Piece | null) => (p ? p.enchant + p.exceed : 0);

/** A difference as shown: "+12", "−3.5%", "" for none. */
export function diffText(r: Pick<DiffRow, "diff" | "pct">): string {
  if (!r.diff) return "";
  const v = Math.abs(r.diff), s = r.pct ? `${round(v)}%` : Number.isInteger(v) ? v.toLocaleString("en-US") : String(round(v));
  return `${r.diff > 0 ? "+" : "−"}${s}`;
}
