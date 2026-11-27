/**
 * Players › Upgrades: which bonus lines to reroll, piece by piece, and which piece first.
 *
 * The game's own chances (the reroll window lists every line a slot can roll with its % and range), transcribed by
 * hand from the player's screenshots of 2026-11-27 (a Templar's pieces). The chance doesn't change with the piece's
 * level (a ring of level 86 and one of 102 list the same %, other ranges), so only the % are kept here. The skill
 * lines are the class's own: 12 active skills on weapons, off-hands and rings (8 at 1.666%, 4 at 1.668%: 20% in all),
 * 10 passive skills on armour, necklace and earrings (2% each). Boots: Front Defense and Critical Hit Resist were off
 * the screenshot, taken as every other armour piece's (the slot then sums to 100%, as each other one does).
 *
 * The game's rules, as the player described them: rerolling one line (a Sync Stone or a gold piece of gear) picks the
 * line and never gives one the piece already has; a reset (300 Kina + 3 Soul Codex: Reset) draws every line again,
 * where an old line can come back, and a piece never holds the same line twice. The value within the range is not
 * counted: it can be raised later, cheaply.
 *
 * Bracelets (level 70 and up): 4 Soul Binding lines out of 8, 12.5% each; rebinding one shows the other four at 25%
 * (the player's screenshot 2026-11-27: the line being rebound is left out too, as on every other piece). Its value
 * (5-10: 46.67 / 25.46 / 13.89 / 7.58 / 4.14 / 2.26%) is not counted either. `UNOBTAINABLE` = best-in-slot lines the
 * game can't give yet (Time [Siel] on bracelets): left out of the plan and named under it.
 *
 * Adding a line (`ADD_LINE`, the player 2026-11-27): 2 Philosopher's Stones + 1,000,000 Kina, once per piece, any
 * piece but bracelets; drawn like a reroll (never a line the piece has), rerollable after; lost when the piece is
 * transferred to a new one. The official site marks it (`added: true` on the line, the game's purple one).
 */
/** Lines worth less (% of top players carrying it) are rerolled; worth this much or more, aimed at: kisk.app's plans
 *  for the player's pieces (2026-11-27) reroll and aim at the same lines on every armour piece and jewel. */
export const KEEP = 50;
/** A line's worth for a class and slot; `skill` = one of the class's skills (drawn at the slot's skill chance).
 *
 * What a line is worth: the share of the class's top players in Korea who carry it on that slot (`src/assets/carry.json`,
 * kisk.app's tables, the player's screenshots 2026-11-27); skill lines, each player's own choice, are worth their % in
 * the best-in-slot list (bis.json, the player's list over it). Our own score (kisk's also weighs the roll; ours doesn't,
 * as the values can be raised cheaply later): a piece = what its lines are worth over the best its line count could
 * hold, 0-100. A line worth less than `KEEP` is rerolled; a try lands when it gives any line worth `KEEP` or more that
 * the piece lacks and the slot's draw holds (kisk counts its Best, Good and Fine lines alike: its "33% a try" on the
 * player's earrings comes out the same); lines the draw doesn't hold (Time and Space on bracelets, Perfect Chance on
 * capes) count for the score but can't be aimed at. The least likely line is rerolled first (it is then excluded from
 * the draw the longest, which helps the others); the pieces rank by the score they gain per expected try.
 */

export const REROLL_CHECKED = "2026-11-27";

const ARMOUR_COMMON: Record<string, number> = {
  Dexterity: 3.2, Constitution: 3.2, Willpower: 3.2, Attack: 3.2, "Critical Hit": 4, Accuracy: 4, Defense: 4, Evasion: 4,
  "Critical Damage Defense": 4.8, "Back Defense": 4, "Front Defense": 4, "Critical Hit Resist": 4.8, Block: 4.8, MP: 4.8,
  HP: 4.8, "Natural MP Regen": 4.8, "Natural HP Regen": 4.8,
};
const armour = (special: Record<string, number>) => ({ stats: { ...special, ...ARMOUR_COMMON }, skills: { count: 10, pct: 2 } });
const WEAPON: Record<string, number> = {
  "Combat Speed": 3.2, "Damage Boost": 1.6, "Multi-hit Chance": 4.8, "Weapon Damage Boost": 3.2, "Status Effect Chance": 3.2,
  Might: 4.8, Precision: 5.6, Attack: 5.6, "Critical Hit": 5.6, "Critical Attack": 6.4, "Back Attack": 5.6, "Front Attack": 5.6,
  Accuracy: 6.4, Block: 5.6, MP: 6.4, HP: 6.4,
};
const JEWEL: Record<string, number> = {
  Might: 1.6, Precision: 1.6, Intelligence: 1.6, "Flight Power": 4.8, Attack: 4.8, "Critical Hit": 4.8, Accuracy: 4.8,
  Defense: 4.8, Evasion: 4.8, "Critical Hit Resist": 7.2, Block: 7.2, MP: 7.2, HP: 7.2, "Natural MP Regen": 8, "Natural HP Regen": 8,
};

export interface SlotPool { stats: Record<string, number>; skills: { count: number; pct: number } }

export const ADD_LINE = { stones: 2, kina: 1_000_000 };

export interface Worth { stat: string; pct?: number; skill?: boolean }

/** What a class's lines are worth on a slot: the top players' carry table, and the best-in-slot list's skill lines
 *  (its names no slot's draw or carry table has). */
export function worthLines(carry: Record<string, number> | undefined, bis: { stat: string; pct?: number }[] | null, statNames: Set<string>,
  passives: { stat: string; pct?: number }[] = []): Worth[] {
  const out: Worth[] = Object.entries(carry ?? {}).map(([stat, pct]) => ({ stat, pct }));
  for (const l of [...(bis ?? []), ...passives]) if (!statNames.has(norm(l.stat)) && !out.some((o) => norm(o.stat) === norm(l.stat))) out.push({ stat: l.stat, pct: l.pct ?? 100, skill: true });
  return out;
}
/** The static's rank tables (`src/assets/ranks.json`): per slot, lines with a rank S / A / B / C and a note. */
export interface RankFile { tiers: Record<string, number>; slots: Record<string, [string, string, string?][]> }
export interface RankedLine { rank: string; note?: string }
/** A slot's ranks as worth (a carry table's shape): the tier's value, a little less for each line ranked before it
 *  in the same tier (their order); null for a slot the tables leave out (rings: skills only). */
export function rankTable(file: RankFile, slot: string): { worth: Record<string, number>; ranked: Record<string, RankedLine> } | null {
  const rows = file.slots[slot];
  if (!rows) return null;
  const worth: Record<string, number> = {}, ranked: Record<string, RankedLine> = {}, seen: Record<string, number> = {};
  for (const [stat, rank, note] of rows) {
    const i = seen[rank] = (seen[rank] ?? -1) + 1;
    worth[stat] = (file.tiers[rank] ?? 0) - i;
    ranked[stat] = note ? { rank, note } : { rank };
  }
  return { worth, ranked };
}
/** Skill lines under the rank tables: which ones stay the best-in-slot's, each worth B ("Main Passive" in the tables). */
export const rankSkills = (file: RankFile, lines: { stat: string; pct?: number }[]) =>
  lines.map((l) => ({ stat: l.stat, pct: (l.pct ?? 100) >= KEEP ? file.tiers.B : l.pct ?? 0 }));
/** Armour, necklaces and earrings draw the same passive skills: each is worth its most carried share over the class's
 *  best-in-slot armour lists (a list holds only its three most carried; kisk.app aims at all of them on every piece). */
export const ARMOUR_SLOTS = ["Torso", "Pants", "Helmet", "Shoulders", "Gloves", "Boots", "Cape"];
export function armourPassives(lists: ({ stat: string; pct?: number }[] | null)[], statNames: Set<string>): { stat: string; pct: number }[] {
  const best = new Map<string, { stat: string; pct: number }>();
  for (const l of lists.flat()) if (l && !statNames.has(norm(l.stat))) {
    const k = norm(l.stat), p = l.pct ?? 100;
    if ((best.get(k)?.pct ?? -1) < p) best.set(k, { stat: l.stat, pct: p });
  }
  return [...best.values()];
}
/** Every stat name a draw or a carry table has (lower case): anything else on a piece is a skill. */
export function statNamesOf(carry: Record<string, Record<string, Record<string, number>>>): Set<string> {
  const s = new Set<string>();
  for (const p of Object.values(REROLL_POOLS)) for (const k of Object.keys(p.stats)) s.add(norm(k));
  for (const c of Object.values(carry)) for (const sl of Object.values(c)) for (const k of Object.keys(sl)) s.add(norm(k));
  return s;
}

/** Every line a slot can roll, by the best-in-slot slot names (`bis.ts` `bisSlot`). Belts, runes and arcana (not rerolled): none. */
export const REROLL_POOLS: Record<string, SlotPool> = {
  Weapon: { stats: WEAPON, skills: { count: 12, pct: 20 / 12 } },
  "Off-hand": { stats: WEAPON, skills: { count: 12, pct: 20 / 12 } },
  Helmet: armour({ "Incoming Heal": 2.4, "Double Chance": 0.96, Endurance: 0.96, "Attack increase": 0.96, "Perfect Resist": 0.96, "Status Effect Resist": 2.4, "Weapon Damage Tolerance": 0.96 }),
  Shoulders: armour({ "Critical Damage Boost": 2.4, Regeneration: 0.96, "Double Chance": 0.96, "Defense increase": 0.96, "Endurance Penetration": 0.96, "Status Effect Resist": 2.4, "Perfect Resist": 0.96 }),
  Torso: armour({ "Damage Boost": 2.4, Regeneration: 0.96, "Perfect Chance": 0.96, "Defense increase": 0.96, "Double Resist": 0.96, "Status Effect Resist": 2.4, "Weapon Damage Tolerance": 0.96 }),
  Pants: armour({ "Damage Tolerance": 2.4, "Perfect Chance": 0.96, Endurance: 0.96, "Attack increase": 0.96, "Double Resist": 0.96, "Status Effect Resist": 2.4, "Multi-hit Resist": 0.96 }),
  Gloves: armour({ "Combat Speed": 2.4, "Perfect Chance": 0.96, Regeneration: 0.96, "Defense increase": 0.96, "Endurance Penetration": 0.96, "Status Effect Resist": 2.4, "Multi-hit Resist": 0.96 }),
  Boots: armour({ "Move Speed": 2.4, "Perfect Chance": 0.96, Regeneration: 0.96, "Defense increase": 0.96, "Perfect Resist": 0.96, "Status Effect Resist": 2.4, "Endurance Penetration": 0.96 }),
  Cape: armour({ "Critical Damage Tolerance": 2.4, "Double Chance": 0.96, Endurance: 0.96, "Attack increase": 0.96, "Weapon Damage Tolerance": 0.96, "Status Effect Resist": 2.4, "Endurance Penetration": 0.96 }),
  Necklace: { stats: { "Combat Speed": 1.6, ...JEWEL }, skills: { count: 10, pct: 2 } },
  Earring: { stats: { "Move Speed": 1.6, ...JEWEL }, skills: { count: 10, pct: 2 } },
  Bracelet: {
    stats: Object.fromEntries(["Justice [Nezekan]", "Freedom [Vaizel]", "Illusion [Kaisinel]", "Life [Yustiel]", "Destruction [Zikel]",
      "Death [Triniel]", "Wisdom [Lumiel]", "Destiny [Marchutan]"].map((n) => [n, 12.5])),
    skills: { count: 0, pct: 0 },
  },
  Ring: { stats: { ...JEWEL, "Critical Hit Resist": 7.6, Block: 7.6, MP: 7.6, HP: 7.6 }, skills: { count: 12, pct: 20 / 12 } },
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** A line's chance in a slot's draw (%): a stat by name, anything else = one of the class's skills. */
export function chanceOf(pool: SlotPool, line: string): number {
  const n = norm(line);
  for (const [k, v] of Object.entries(pool.stats)) if (norm(k) === n) return v;
  return pool.skills.pct;
}

export interface PlanStep { line: string; chance: number } // chance = of landing an ideal line in one try (0..1), expected over the steps before
export interface PiecePlan {
  score: number;      // 0..100 now
  after: number;      // 0..100 expected after the plan
  best: number;       // what a perfect piece of this line count would be worth (sum of %): the 100
  steps: PlanStep[];
  tries: number;      // expected tries (Sync Stones / gold pieces) for the whole plan
  next: number;       // what the next try is worth: its chance × the worth it adds (line landed − line replaced, the lines' own values, not the piece's score): the order of the pieces
  missing: string[];  // ideal lines the piece doesn't have (and the game can give)
  unobtainable: string[]; // ideal lines the game can't give yet
  reset: { ideal: number; score: number } | null; // a reset's expected ideal lines and score (0..100)
  lines: { line: string; worth: number; chance: number }[]; // the piece's lines: what each is worth and its % in the draw (the Info panel's example)
  add: { chance: number; worth: number } | null;  // a Philosopher's Stone line (when the piece can take one): its chance to be ideal, and the ideal's expected %
}

/**
 * The plan for one piece: `lines` = its bonus lines and skills by name, `ideal` = the class's lines for the slot with
 * their best-in-slot %. Null when the slot has no known draw or no ideal lines.
 */
export function planPiece(slot: string, lines: string[], allIdeal: Worth[], resetDraws = 4000, canAdd = false): PiecePlan | null {
  const pool = REROLL_POOLS[slot];
  if (!pool || !allIdeal.length || !lines.length) return null;
  const inDraw = (l: Worth) => Object.keys(pool.stats).some((k) => norm(k) === norm(l.stat)) || (!!l.skill && pool.skills.count > 0);
  const worth = new Map(allIdeal.map((l) => [norm(l.stat), l.pct ?? 100]));
  // A ring's skill lines are the player's own pick (the arcana's skills, the luck of the rolls): kept, worth KEEP.
  const ownSkill = (l: string) => slot === "Ring" && !Object.keys(pool.stats).some((k) => norm(k) === norm(l));
  const valueOf = (l: string) => Math.max(worth.get(norm(l)) ?? 0, ownSkill(l) ? KEEP : 0);
  const best = [...worth.values()].sort((a, b) => b - a).slice(0, lines.length).reduce((a, b) => a + b, 0);
  const have = lines.map(norm);
  const wanted = allIdeal.filter((l) => (l.pct ?? 100) >= KEEP && !have.includes(norm(l.stat)));
  const missing = wanted.filter(inDraw);
  const unobtainable = wanted.filter((l) => !inDraw(l)).map((l) => l.stat);
  const ideal = allIdeal;
  // The lines not worth keeping, the least likely first.
  const bad = lines.filter((l) => valueOf(l) < KEEP).sort((a, b) => chanceOf(pool, a) - chanceOf(pool, b));
  const score = lines.reduce((s, l) => s + valueOf(l), 0);
  const stepCount = Math.min(bad.length, missing.length);

  // Exact: a distribution over which ideal lines were gained so far (bit masks), step by step.
  let states = new Map<number, number>([[0, 1]]);
  const steps: PlanStep[] = [];
  let tries = 0, gained = 0, firstGain = 0;
  const presentWeight = (mask: number, k: number) => {
    // lines still on the piece at step k: the good ones, the bad ones not rerolled yet (incl. the one now), the ones gained
    let w = lines.filter((l) => valueOf(l) >= KEEP).reduce((s, l) => s + chanceOf(pool, l), 0);
    for (let i = k; i < bad.length; i++) w += chanceOf(pool, bad[i]);
    missing.forEach((m, i) => { if (mask & (1 << i)) w += chanceOf(pool, m.stat); });
    return w;
  };
  for (let k = 0; k < stepCount; k++) {
    const next = new Map<number, number>();
    let stepChance = 0;
    for (const [mask, pr] of states) {
      const left = missing.map((m, i) => ({ m, i })).filter(({ i }) => !(mask & (1 << i)));
      const want = left.reduce((s, { m }) => s + chanceOf(pool, m.stat), 0);
      const p = want / (100 - presentWeight(mask, k));
      stepChance += pr * p;
      tries += pr / p;
      for (const { m, i } of left) {
        const q = chanceOf(pool, m.stat) / want;
        next.set(mask | (1 << i), (next.get(mask | (1 << i)) ?? 0) + pr * q);
        gained += pr * q * ((m.pct ?? 100) - valueOf(bad[k]));
      }
    }
    if (k === 0) firstGain = gained;
    steps.push({ line: bad[k], chance: stepChance });
    states = next;
  }

  // A line added now: drawn over the slot without every line the piece has.
  const own = lines.reduce((s, l) => s + chanceOf(pool, l), 0);
  const want = missing.reduce((s, m) => s + chanceOf(pool, m.stat), 0);
  const add = canAdd && slot !== "Bracelet" && want > 0
    ? { chance: want / (100 - own), worth: missing.reduce((s, m) => s + chanceOf(pool, m.stat) * (m.pct ?? 100), 0) / want }
    : null;

  return {
    add, lines: lines.map((l) => ({ line: l, worth: valueOf(l), chance: chanceOf(pool, l) })),
    score: best ? (100 * score) / best : 0,
    after: best ? (100 * (score + gained)) / best : 0,
    best, steps, tries, next: steps.length ? steps[0].chance * firstGain : 0, missing: missing.map((m) => m.stat), unobtainable,
    reset: resetDraws > 0 ? resetOdds(pool, ideal, lines.length, best, resetDraws) : null,
  };
}

/** A reset: every line drawn again without repeats, weighted by its chance. Simulated (seeded, so it repeats). */
function resetOdds(pool: SlotPool, ideal: Worth[], count: number, best: number, draws: number) {
  const entries: { name: string; w: number }[] = Object.entries(pool.stats).map(([name, w]) => ({ name: norm(name), w }));
  const idealSkills = ideal.filter((l) => l.skill).map((l) => norm(l.stat));
  for (let i = 0; i < pool.skills.count; i++) entries.push({ name: idealSkills[i] ?? `skill ${i}`, w: pool.skills.pct });
  const worth = new Map(ideal.map((l) => [norm(l.stat), l.pct ?? 100]));
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let idealSum = 0, valueSum = 0;
  for (let d = 0; d < draws; d++) {
    const left = entries.slice();
    for (let k = 0; k < count && left.length; k++) {
      let r = rnd() * left.reduce((s, e) => s + e.w, 0), j = 0;
      while (j < left.length - 1 && (r -= left[j].w) > 0) j++;
      const [e] = left.splice(j, 1);
      const v = worth.get(e.name) ?? 0;
      if (v >= KEEP) idealSum++;
      valueSum += v;
    }
  }
  return { ideal: idealSum / draws, score: best ? (100 * valueSum) / draws / best : 0 };
}

/** The order to work in: the most score per expected try first; pieces with nothing to gain last. */
export function rankPlans<T extends { plan: PiecePlan }>(list: T[]): T[] {
  // The next Sync Stone goes where it adds the most: one try at a time, so a piece with many lines to fix comes first
  // while its first reroll pays more than another piece's, and moves down once its lines get harder (the player's
  // remark, 2026-11-27: the whole plan's average put a weapon with one line to fix before earrings with four).
  const rate = (p: PiecePlan) => (p.steps.length ? p.next : -1);
  return [...list].sort((a, b) => rate(b.plan) - rate(a.plan));
}
