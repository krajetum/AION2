<script lang="ts">
  // Players › Best upgrades › Info: how the page works, with the formulas and the first card's own numbers worked out.
  import type { Piece } from "../../domain/armory.ts";
  import { bisSlot } from "../../domain/bis.ts";
  import { ADD_LINE, KEEP, REROLL_POOLS, chanceOf, type PiecePlan } from "../../domain/reroll.ts";
  import { ARCANA_LEVELS, ARCANA_POOL, SKILL_TARGET, TRANSMUTE } from "../../domain/arcana.ts";

  let { example, ranked }: { example: { p: Piece; plan: PiecePlan } | null; ranked: boolean } = $props();
  const r1 = (v: number) => (Math.round(v * 10) / 10).toString();
  // The example: the first card's lines, its score and its first reroll's odds, the numbers as the plan used them.
  const ex = $derived.by(() => {
    if (!example) return null;
    const slot = bisSlot(example.p.slotName), pool = slot ? REROLL_POOLS[slot] : null;
    const { plan } = example;
    if (!pool) return null;
    const want = plan.missing.map((m) => ({ line: m, chance: chanceOf(pool, m) }));
    const own = plan.lines.reduce((s, l) => s + l.chance, 0), wantSum = want.reduce((s, l) => s + l.chance, 0);
    const sum = plan.lines.reduce((s, l) => s + l.worth, 0);
    return { name: example.p.name, plan, want, own, wantSum, sum };
  });
  const chalice = TRANSMUTE.find((t) => t.fixed === 2)!;
</script>

<div class="info">
  <div class="blk">
    <h4>What a line is worth</h4>
    {#if ranked}<p>Your static's rank tables: <b>S = 100</b>, <b>A = 80</b>, <b>B = 60</b>, <b>C = 20</b>, a line the table doesn't list = 0. Inside one rank, 1 less for each line ranked above it (their order). Skill lines keep your best-in-slot choice and are worth B (the tables' "Main Passive"); a skill not in it = 0. Rings, which the tables leave out: the share of top players carrying the line (kisk.app), a skill line on a ring at least {KEEP}.</p>
    {:else}<p>The share of top players of your class carrying the line on that slot (kisk.app); skill lines, their % in your best-in-slot list.</p>{/if}
    <p>A line worth less than <b>{KEEP}</b> is rerolled. What a reroll can land, in tiers: <b>Best</b> ≥ 90, <b>Good</b> ≥ 70, <b>Fine</b> ≥ {KEEP}.</p>
  </div>

  <div class="blk">
    <h4>The score: now → ≈ after / 100</h4>
    <p class="f">score = 100 × (worth of the piece's lines) ÷ (worth of the best lines the slot could hold, as many as the piece has)</p>
    {#if ex}<p>{ex.name}: {ex.plan.lines.map((l) => `${l.line} ${r1(l.worth)}`).join(" + ")} = <b>{r1(ex.sum)}</b>; the best {ex.plan.lines.length} lines = <b>{r1(ex.plan.best)}</b> → 100 × {r1(ex.sum)} ÷ {r1(ex.plan.best)} = <b>{Math.round(ex.plan.score)}</b>.</p>{/if}
    <p>"≈ after" = the score once every line under {KEEP} has been rerolled into a wanted one: each wanted line it can land, weighted by its chance, minus the line it replaces, added up step by step over every way the rerolls can go (exact, not a simulation){#if ex}; here <b>≈{Math.round(ex.plan.after)}</b>{/if}.</p>
  </div>

  <div class="blk">
    <h4>"% a try" and "≈ tries"</h4>
    <p>One try = a Sync Stone or a gold piece, on one line. It never lands a line the piece already has, the one being rerolled included (the game's reroll window shows every other line's % raised to fill 100), so:</p>
    <p class="f">chance a try = (draw % of the wanted lines the piece lacks) ÷ (100 − draw % of every line on the piece)</p>
    {#if ex && ex.plan.steps.length}<p>{ex.name}, reroll {ex.plan.steps[0].line}: wanted {ex.want.map((w) => `${w.line} ${r1(w.chance)}%`).join(" + ")} = {r1(ex.wantSum)}%; lines on it {ex.plan.lines.map((l) => `${r1(l.chance)}`).join(" + ")} = {r1(ex.own)}% → {r1(ex.wantSum)} ÷ (100 − {r1(ex.own)}) = <b>{Math.round(100 * ex.plan.steps[0].chance)}%</b>.</p>{/if}
    <p class="f">expected tries for one line = 1 ÷ chance a try</p>
    <p>"≈ tries" adds that up over the lines to reroll; after a hit the next line's odds change (the line landed is now on the piece and out of the draw), so it is averaged over which line landed{#if ex}: here <b>≈{Math.ceil(ex.plan.tries)}</b>{/if}.</p>
    <p>Within a piece, the line least likely in the draw is rerolled first: a junk line still on the piece keeps itself out of the draw, so a common one left until last raises the odds of the others.</p>
  </div>

  <div class="blk">
    <h4>Which piece first</h4>
    <p class="f">points per try = (≈ after − score now) ÷ ≈ tries</p>
    <p>The highest is "Up next", then the rest in that order: the most score for each Sync Stone spent.</p>
  </div>

  <div class="blk">
    <h4>Options under a card</h4>
    <p><b>Philosopher's Stone line</b> ({ADD_LINE.stones} stones + {ADD_LINE.kina.toLocaleString()} Kina, once per piece, not on bracelets, lost when the piece is transferred): drawn like a reroll over every line the piece has, the same formula. <b>Reset</b> (300 Kina + 3 Soul Codex: Reset): every line drawn again; its average comes from 4,000 simulated draws (always the same ones, so it doesn't move between visits). Lines top players carry that this slot's draw can't give are listed, not aimed at.</p>
  </div>

  <div class="blk">
    <h4>Arcana</h4>
    <p>The main active skills go to level <b>{SKILL_TARGET}</b> (the profile's levels already hold every bonus), the main passives as high as they go. A skill already at {SKILL_TARGET} without this arcana (gear lines, the other arcana) isn't needed on it; levels past {SKILL_TARGET}, or extra levels on a skill not wanted, do nothing.</p>
    <p>The Chalice is crafted with Transmute, its 2 main skills picked ({chalice.crystals} crystals + {chalice.kina.toLocaleString()} Kina): the other 2 come from the {ARCANA_POOL.Arcana1 - 2} skills left, all equally likely, no repeats. The chance that k of the g wanted ones come out among d drawn from n:</p>
    <p class="f">P(k) = C(g, k) × C(n − g, d − k) ÷ C(n, d)  (C = combinations)</p>
    <p>For the Templar's Chalice (n = 20, d = 2, g = 2): all 4 = 1 ÷ C(20, 2) = 1 ÷ 190 ≈ 0.5%; at least one more = 1 − C(18, 2) ÷ 190 ≈ 19%. "Better" = more wanted skills than the arcana has now. The golden ones (4 of 5-6 skills) are farmed. Each of the {ARCANA_LEVELS} enhance levels adds +1 to one of the 4 skills at random:</p>
    <p class="f">chance of the levels e₁ … e₄ (above +1) = 5! ÷ (e₁! e₂! e₃! e₄!) ÷ 4⁵   (+4/+3/+1/+1: 10 ÷ 1,024 ≈ 1%)</p>
    <p>Order: the Chalice first, then the arcana missing the most skills. "Already good" at the end: pieces with nothing to reroll, arcana with every skill wanted and no level wasted, skills at {SKILL_TARGET}.</p>
  </div>
</div>

<style>
  .info { display: grid; gap: 14px; margin: 0 0 14px; padding: 14px 16px; border-radius: var(--r-lg); font-size: var(--fs-sm); color: var(--muted-foreground);
    background: var(--card); border: 1px solid var(--border); }
  h4 { margin: 0 0 4px; font-size: var(--fs-sm); font-weight: 700; color: var(--foreground); }
  p { margin: 0 0 6px; }
  b { color: var(--foreground); }
  .f { padding: 6px 10px; border-radius: var(--r-md); font-family: ui-monospace, monospace; font-size: var(--fs-xs); color: var(--foreground);
    background: color-mix(in srgb, var(--foreground) 6%, transparent); }
</style>
