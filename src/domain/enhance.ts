// Enhancement page: what taking a Unique piece from +a to +b costs on average, and how unlucky it can get. Pure.
// Sources (checked 2026-11-01):
// - metabot.gg/en/aion-2/enhancement: Global client data (build 0.0.4387.0), the per-step table for an item level 102
//   Unique (Ludra's Blade of Extinction) and the cost to +15 of 15 Unique items, item level 36 to 102.
// - gamewith.ai/aion2/en/enhancement-simulator: NCSOFT's probability disclosure for the Korean service (2026-09-30).
// Both give the same success chances and the same +5% per failure. Neither gives the costs of other item levels per step:
// they are the item level 102 ones scaled by item level, which matches metabot's 15 totals within 0.5% (Kina) and 0.1%
// (stones), and gamewith's example within 1%; so every cost here is "≈". Failing costs only the materials: no level is lost.

export const VERIFIED = "2026-11-01";
export const SOURCES = [
  { name: "MetaBot.GG, Enhancement Calculator (Global client 0.0.4387.0)", url: "https://metabot.gg/en/aion-2/enhancement" },
  { name: "GameWith, Enhancement Simulator (Korean probability disclosure)", url: "https://gamewith.ai/aion2/en/enhancement-simulator" },
];

/** The item level the per-step costs are of (metabot's table). */
export const BASE_LEVEL = 102;
/** Each failure at a step adds this much to the next attempt's chance there, until a success. */
export const FAIL_BONUS = 5;
export const MAX_LEVEL = 15;

/** Unique gear, step +n → +n+1 at index n: success chance (%), Kina and Enhance Stones per attempt at BASE_LEVEL. */
export const UNIQUE: { chance: number; kina: number; stones: number }[] = [
  { chance: 100, kina: 12_800, stones: 510 },
  { chance: 100, kina: 18_300, stones: 730 },
  { chance: 100, kina: 33_300, stones: 1_330 },
  { chance: 100, kina: 51_000, stones: 2_040 },
  { chance: 100, kina: 72_000, stones: 2_860 },
  { chance: 100, kina: 94_000, stones: 3_750 },
  { chance: 100, kina: 119_000, stones: 4_730 },
  { chance: 100, kina: 145_000, stones: 5_770 },
  { chance: 100, kina: 173_000, stones: 6_890 },
  { chance: 100, kina: 202_000, stones: 8_070 },
  { chance: 65, kina: 360_000, stones: 9_310 },
  { chance: 50, kina: 540_000, stones: 10_610 },
  { chance: 35, kina: 860_000, stones: 11_960 },
  { chance: 25, kina: 1_340_000, stones: 13_360 },
  { chance: 20, kina: 1_860_000, stones: 14_820 },
];

/** P(the step succeeds on attempt n), n = 1…: each failure adds FAIL_BONUS, 100% at the latest. */
export function attempts(chance: number): number[] {
  const out: number[] = [];
  let fail = 1;
  for (let c = chance; fail > 1e-12; c = Math.min(100, c + FAIL_BONUS)) {
    out.push(fail * c / 100);
    fail *= 1 - c / 100;
  }
  return out;
}

export interface Step { from: number; chance: number; kina: number; stones: number; avg: number; max: number }

export interface Plan {
  steps: Step[];
  attempts: number; // expected, all steps
  kina: number; stones: number; // expected
  /** Kina, plus the stones at `stonePrice` each: 10% of runs cost less than `lucky`, 50% `typical`, 90% `unlucky`; `worst` = every step at its last attempt. */
  lucky: number; typical: number; unlucky: number; worst: number;
}

/** Cost of +from → +to for a Unique of `itemLevel`; `stonePrice` (Kina per Enhance Stone, 0 = left out) goes into the range. */
export function plan(itemLevel: number, from: number, to: number, stonePrice = 0): Plan {
  const k = itemLevel / BASE_LEVEL;
  const steps: Step[] = [];
  for (let n = Math.max(0, from); n < Math.min(to, MAX_LEVEL); n++) {
    const s = UNIQUE[n], p = attempts(s.chance);
    steps.push({ from: n, chance: s.chance, kina: Math.round(s.kina * k), stones: Math.round(s.stones * k),
      avg: p.reduce((t, q, i) => t + q * (i + 1), 0), max: p.length });
  }
  // The spread of the total: every step's attempts are independent, so their costs convolve. On a grid of `unit`
  // (1/50,000 of the worst case, so a few Kina off at most), which keeps it fast enough to follow the inputs.
  const each = steps.map((s) => s.kina + s.stones * stonePrice);
  const worst = steps.reduce((t, s, i) => t + each[i] * s.max, 0);
  const unit = Math.max(1, worst / 50_000);
  let dist = new Float64Array(1).fill(1);
  for (const [i, s] of steps.entries()) {
    const p = attempts(s.chance), u = Math.round(each[i] / unit), next = new Float64Array(dist.length + u * p.length);
    p.forEach((q, n) => { for (let v = 0; v < dist.length; v++) if (dist[v]) next[v + u * (n + 1)] += dist[v] * q; });
    dist = next;
  }
  const at = (q: number) => { let t = 0; for (let v = 0; v < dist.length; v++) if ((t += dist[v]) >= q - 1e-9) return Math.min(worst, Math.round(v * unit)); return worst; };
  return {
    steps,
    attempts: steps.reduce((t, s) => t + s.avg, 0),
    kina: steps.reduce((t, s) => t + s.kina * s.avg, 0),
    stones: steps.reduce((t, s) => t + s.stones * s.avg, 0),
    lucky: at(0.1), typical: at(0.5), unlucky: at(0.9), worst,
  };
}
