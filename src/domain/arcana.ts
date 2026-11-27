// Players › Best upgrades › Arcana: the Transmute (the game's Arcana window): a Unique arcana's 4 skills drawn again,
// 1 or 2 of them picked by the player and sure, the others drawn at random, all equally likely, from the arcana's pool,
// never twice the same; grade, main effect (Life [Yustiel] …) and item level stay; the arcana starts again at +0.
// Then each of its 5 enhance levels adds +1 to one of the 4 skills at random (a new arcana: every skill +1).
// The player's answers and screenshots, 2026-11-27 (a Templar's pools); no transmute without a pick.

export const TRANSMUTE_CHECKED = "2026-11-27";
/** Skills a transmute can draw per arcana: the Chalice any of the class's 22, the others a fixed share of them
 *  (Parchment 6, Compass 6, Bell 5, Mirror the 5 left). Counted on a Templar, taken as every class's. */
export const ARCANA_POOL: Record<string, number> = { Arcana1: 22, Arcana2: 6, Arcana3: 6, Arcana4: 5, Arcana5: 5 };
/** What a transmute costs by how many skills are picked. */
export const TRANSMUTE = [{ fixed: 1, crystals: 5, kina: 2_000_000 }, { fixed: 2, crystals: 15, kina: 5_000_000 }];
export const ARCANA_SKILLS = 4;
export const ARCANA_LEVELS = 5;

const choose = (n: number, k: number) => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};
/** P(exactly x of the `good` ones among `draw` taken from `pool`, without putting back). */
const hyper = (pool: number, good: number, draw: number, x: number) => choose(good, x) * choose(pool - good, draw - x) / choose(pool, draw);

export interface TransmuteOption {
  fixed: string[]; crystals: number; kina: number;
  better: number; // chance a try gives more best-in-slot skills than the arcana has now
  perfect: number; // chance a try gives all of them
  expected: number; // best-in-slot skills on average after a try
}
export interface ArcanaPlan {
  have: string[]; missing: string[]; pool: number;
  options: TransmuteOption[];
  levels: number | null; // chance the 5 random levels give the list's levels (+4 / +3 / +1 / +1), on an arcana with all of them
}

/** The levels a list asks for ("+4") over a new arcana's +1: the chance 5 random +1s land exactly there. */
export function levelChance(levels: number[]): number | null {
  if (levels.length !== ARCANA_SKILLS) return null;
  const extra = levels.map((l) => l - 1);
  if (extra.some((e) => e < 0) || extra.reduce((a, b) => a + b, 0) !== ARCANA_LEVELS) return null;
  let ways = 1;
  for (let i = 2; i <= ARCANA_LEVELS; i++) ways *= i;
  for (const e of extra) for (let i = 2; i <= e; i++) ways /= i;
  return ways / ARCANA_SKILLS ** ARCANA_LEVELS;
}

/** A transmute plan for one arcana: its skills against the ideal ones (most wanted first, as the list orders them). */
export function arcanaPlan(slot: string, skills: string[], ideal: { stat: string; value?: string }[]): ArcanaPlan | null {
  const pool = ARCANA_POOL[slot];
  if (!pool || !ideal.length) return null;
  const want = ideal.slice(0, ARCANA_SKILLS).map((l) => l.stat);
  const have = want.filter((s) => skills.includes(s)), missing = want.filter((s) => !skills.includes(s));
  const options: TransmuteOption[] = [];
  if (missing.length) for (const t of TRANSMUTE) {
    if (t.fixed > want.length) continue;
    const draw = ARCANA_SKILLS - t.fixed, left = pool - t.fixed, good = want.length - t.fixed;
    let better = 0, perfect = 0, expected = t.fixed;
    for (let x = 0; x <= Math.min(good, draw); x++) {
      const p = hyper(left, good, draw, x);
      if (t.fixed + x > have.length) better += p;
      if (x === good) perfect += p;
      expected += x * p;
    }
    options.push({ fixed: want.slice(0, t.fixed), crystals: t.crystals, kina: t.kina, better, perfect, expected });
  }
  const levels = levelChance(ideal.map((l) => Number(String(l.value ?? "").replace(/[^\d]/g, "")) || 0));
  return { have, missing, pool, options, levels };
}
