// Your Genus Insight as the meter reads it from the game (src-tauri/meter/src/genus.rs): five insights, each with up
// to 3 presets of rolled lines; kept per character (`AppData.genus`). Stat ids are the game's (the same as its stat
// record); names checked against the player's insight pages and Stat Info (2026-11-21). Pure.

export interface GenusLine { slot: number; grade: number; stat: number; value: number }
export interface GenusInsight { id: number; level: number; presets: GenusLine[][] }
/** `preset`: the one switched to (1-3), null until the game said so (it says nothing at login). */
export interface GenusRead { insights: GenusInsight[]; preset: number | null; atMs: number }

export const INSIGHTS: Record<number, string> = { 2: "Cogni", 3: "Fera", 4: "Natura", 5: "Varian", 6: "Special" };
export const insightName = (id: number) => INSIGHTS[id] ? `${INSIGHTS[id]} Insight` : `Insight #${id}`;

/** Stat names by id; `pct` = the value is hundredths of a percent. Seen on the insight pages unless marked. */
const STATS: Record<number, { name: string; pct?: true }> = {
  19: { name: "Attack Bonus" }, 31: { name: "Max Attack" }, 32: { name: "Weapon Damage Boost", pct: true },
  41: { name: "Critical Damage Defense" }, 52: { name: "Defense Bonus" }, 57: { name: "PvE Defense" },
  69: { name: "Power Shard Damage Bonus" }, 70: { name: "Damage Tolerance", pct: true }, 99: { name: "Back Defense" },
  100: { name: "Back Attack Critical Hit" }, // from Stat Info: the line added 24 there
  104: { name: "Accuracy Bonus" }, 116: { name: "Evasion Bonus" }, 128: { name: "Critical Hit" }, 193: { name: "HP" },
  196: { name: "HP increase", pct: true }, 199: { name: "MP" }, // MP: the stat record's MP before Destiny's %
  379: { name: "PvE Damage Boost", pct: true }, 442: { name: "Perfect Chance", pct: true },
  445: { name: "Endurance", pct: true }, 447: { name: "Double Resist", pct: true },
};
// The races' stats run in blocks of 8 from 393 (Cogni, Fera, Natura, Varian); Fera Critical Hit 405, Varian Evasion 420
// and Varian Critical Hit Resist 422 were seen, the 7th and 8th of each block were not.
const RACE_STATS = ["Attack", "Defense", "Accuracy", "Evasion", "Critical Hit", "Critical Hit Resist"];
const RACES = ["Cogni", "Fera", "Natura", "Varian"];

export function statName(id: number): string {
  if (STATS[id]) return STATS[id].name;
  const k = id - 393, race = RACES[Math.floor(k / 8)], stat = RACE_STATS[k % 8];
  return k >= 0 && race && stat ? `${race} ${stat}` : `Stat #${id}`;
}
export const isPct = (id: number) => !!STATS[id]?.pct;

/** Tenths, halves to even: the insight pages show 105 as 1%, 145 as 1.4%, 237 as 2.4%. */
const tenths = (hundredths: number) => {
  const t = hundredths / 10, f = Math.floor(t), r = t - f;
  return r > 0.5 || (r === 0.5 && f % 2 === 1) ? f + 1 : f;
};
/** A value as the game shows it: "2.4%" or "156". */
export const statText = (id: number, value: number) => (isPct(id) ? `${tenths(value) / 10}%` : String(value));

/** The preset shown: the one switched to, else the first with lines, else 1. */
export function shownPreset(g: GenusRead): number {
  if (g.preset && g.insights.some((i) => i.presets[g.preset! - 1])) return g.preset;
  for (let p = 1; p <= 3; p++) if (g.insights.some((i) => i.presets[p - 1]?.length)) return p;
  return 1;
}

/** Each insight's lines in a preset (empty when not rolled). */
export const linesIn = (g: GenusRead, preset: number) =>
  g.insights.map((i) => ({ id: i.id, name: insightName(i.id), level: i.level, lines: i.presets[preset - 1] ?? [] }));

/** All insights' lines in a preset added up by stat, in the order they first appear. */
export function genusTotal(g: GenusRead, preset: number): { stat: number; value: number }[] {
  const out = new Map<number, number>();
  for (const i of g.insights) for (const l of i.presets[preset - 1] ?? []) out.set(l.stat, (out.get(l.stat) ?? 0) + l.value);
  return [...out].map(([stat, value]) => ({ stat, value }));
}

function cleanLine(raw: any): GenusLine | null {
  const ok = (n: unknown, max: number): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= max;
  return raw && ok(raw.slot, 20) && ok(raw.grade, 9) && ok(raw.stat, 65535) && raw.stat > 0 && ok(raw.value, 65535)
    ? { slot: raw.slot, grade: raw.grade, stat: raw.stat, value: raw.value } : null;
}

/** A read from the meter or the save file, checked field by field; null when it isn't one. */
export function cleanGenus(raw: any): GenusRead | null {
  if (!raw || !Array.isArray(raw.insights) || typeof raw.atMs !== "number") return null;
  const insights = raw.insights.filter((i: any) => i && Number.isInteger(i.id) && Number.isInteger(i.level) && Array.isArray(i.presets))
    .map((i: any): GenusInsight => ({ id: i.id, level: i.level,
      presets: i.presets.slice(0, 3).map((p: any) => (Array.isArray(p) ? p.map(cleanLine).filter((l: GenusLine | null): l is GenusLine => !!l) : [])) }));
  if (!insights.length) return null;
  const preset = Number.isInteger(raw.preset) && raw.preset >= 1 && raw.preset <= 3 ? raw.preset : null;
  return { insights, preset, atMs: raw.atMs };
}

export function cleanGenusAll(raw: any): Record<string, GenusRead> {
  const out: Record<string, GenusRead> = {};
  if (raw && typeof raw === "object") for (const [name, g] of Object.entries(raw)) {
    const c = cleanGenus(g);
    if (name.trim() && c) out[name] = c;
  }
  return out;
}

/** The meter's read kept as the character's (a newer read, or the preset switched since). Returns true if it changed. */
export function takeGenus(all: Record<string, GenusRead>, name: string, raw: unknown): boolean {
  const g = cleanGenus(raw);
  if (!name.trim() || !g) return false;
  const had = all[name];
  if (had && had.atMs > g.atMs) return false;
  if (had && had.atMs === g.atMs && had.preset === g.preset) return false;
  all[name] = g;
  return true;
}
