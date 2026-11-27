<script lang="ts">
  // Players › Best upgrades: one card per piece worth improving, the best one first ("Up next"): its score now and the
  // expected one after (a bar), the lines to reroll in order with the chance a try, the ideal lines it can land, and the
  // Philosopher's Stone line and a reset as options (domain/reroll.ts).
  import type { Piece } from "../../domain/armory.ts";
  import { ADD_LINE, KEEP, REROLL_CHECKED, type PiecePlan, type Worth } from "../../domain/reroll.ts";
  import { ARCANA_LEVELS, TRANSMUTE_CHECKED, type ArcanaPlan } from "../../domain/arcana.ts";
  import { ARCANA_KINDS, type BisLine } from "../../domain/bis.ts";

  let { plans, arcana = [], notUnique = [], reading, className, players, source }: { plans: { p: Piece; plan: PiecePlan; ideal: Worth[] }[];
    arcana?: { p: Piece; slot: string; held: { name: string; level: number | null }[]; plan: ArcanaPlan; ideal: BisLine[] }[]; notUnique?: string[]; reading: boolean;
    className: string; players: number; source: { source: string; sourceUrl: string; captured: string } } = $props();
  // The lines it can land, in tiers by how many top players carry them.
  const TIERS = [{ name: "Best", min: 90 }, { name: "Good", min: KEEP }];
  const tierOf = (pct: number) => TIERS.find((t) => pct >= t.min)!.name;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const or = (list: string[]) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}` : list[0] ?? "");
  const lacking = (x: { plan: PiecePlan; ideal: Worth[] }) =>
    x.ideal.filter((l) => x.plan.missing.includes(l.stat)).sort((a, b) => (b.pct ?? 100) - (a.pct ?? 100));
  const pct1 = (v: number) => (v >= 0.995 ? "100%" : v >= 0.1 ? `${Math.round(v * 100)}%` : `${(v * 100).toFixed(1)}%`);
  const todo = $derived(plans.filter((x) => x.plan.steps.length || x.plan.add));
  const done = $derived(plans.filter((x) => !x.plan.steps.length && !x.plan.add));
</script>

{#if !todo.length}<p class="hint">{reading ? "Reading the pieces…" : "Nothing to reroll: every piece has its ideal lines."}</p>{/if}
<ol class="ups">
  {#each todo as x, i (x.p.slot)}{@const plan = x.plan}{@const want = lacking(x)}
    <li class="up grade-edge-{x.p.grade}" class:next={i === 0}>
      <header>
        <span class="icon">{#if x.p.icon}<img src={x.p.icon} alt="" width="44" height="44" loading="lazy">{/if}{#if x.p.enchant}<i>+{x.p.enchant}</i>{/if}</span>
        <div class="title">
          {#if i === 0}<span class="badge">Up next</span>{/if}
          <b class="grade-{x.p.grade}">{x.p.name}</b>
          <small><b>{Math.round(plan.score)}</b> → <b class="after">≈{Math.round(plan.after)}</b> / 100{#if plan.steps.length}&nbsp;· ≈{Math.ceil(plan.tries)} tries{/if}</small>
        </div>
      </header>
      <div class="bar" style="--now:{plan.score}%; --after:{plan.after}%" title="Now {Math.round(plan.score)}, ≈{Math.round(plan.after)} after the rerolls">
        <span class="now"></span><span class="gain"></span>
      </div>
      {#if plan.steps.length}<ol class="steps">
        {#each plan.steps as s, k (k)}<li class:first={k === 0}>
          <span class="n">{k + 1}</span>
          <span class="what">Reroll <b>{s.line}</b> <span class="dim">→ ideally {or(want.map((l) => l.stat))}</span></span>
          <span class="try">{pct(s.chance)} a try</span>
        </li>{/each}
      </ol>
      <p class="dim m-0">Reroll each until it lands one of these it doesn't have yet:</p>{/if}
      <div class="tiers">{#each TIERS as t (t.name)}{@const these = want.filter((l) => tierOf(l.pct ?? 100) === t.name)}{#if these.length}
        <span class="tier">{t.name}</span><div class="chips">{#each these as l (l.stat)}<span class="chip {t.name.toLowerCase()}" title={l.skill ? `Skill: ${l.pct ?? 100}% in your best-in-slot list` : `${l.pct}% of top ${className}s carry it here`}>{l.stat}{#if l.skill} +1{/if}<small>{l.pct ?? 100}%</small></span>{/each}</div>{/if}{/each}</div>
      {#if plan.add}<p class="opt">✦ Room for a Philosopher's Stone line ({ADD_LINE.stones} stones + {ADD_LINE.kina.toLocaleString()} Kina): <b>{pct(plan.add.chance)}</b> it lands one of these. Lost when the piece is transferred to a new one.</p>{/if}
      {#if plan.unobtainable.length}<p class="opt">Not from rerolls ({plan.unobtainable.join(", ")}): top players carry it here, but this slot's draw doesn't give it.</p>{/if}
      {#if plan.reset && plan.steps.length}<p class="opt">A reset (300 Kina + 3 Soul Codex: Reset) gives ≈{plan.reset.ideal.toFixed(1)} ideal lines, ≈{Math.round(plan.reset.score)} / 100 on average.</p>{/if}
    </li>
  {/each}
</ol>
{#if arcana.length || notUnique.length}<h3 class="mt-4 mb-2 text-sm font-semibold">Arcana</h3>
<ol class="ups">
  {#each arcana as x (x.p.slot)}{@const plan = x.plan}{@const kind = ARCANA_KINDS[x.slot] ?? "arcana"}
    <li class="up grade-edge-{x.p.grade}">
      <header>
        <span class="icon">{#if x.p.icon}<img src={x.p.icon} alt="" width="44" height="44" loading="lazy">{/if}{#if x.p.enchant}<i>+{x.p.enchant}</i>{/if}</span>
        <div class="title">
          <b class="grade-{x.p.grade}">{x.p.name}</b>
          <small>{kind} · <b>{plan.have.length}</b> / {plan.have.length + plan.missing.length} best-in-slot skills · {plan.craft ? `craft it: draws from ${plan.pool}` : "farm it"}</small>
        </div>
      </header>
      <div class="chips">{#each x.ideal.slice(0, 4) as l (l.stat)}{@const on = x.held.find((h) => h.name === l.stat)}{@const off = plan.wrong.some((w) => w.name === l.stat)}
        <span class="chip {on ? (off ? 'good' : '') : 'fine'}" title={on ? `On this arcana at +${on.level ?? "?"}, the list wants ${l.value ?? "?"}` : "Missing"}>{on ? "✓ " : ""}{l.stat}<small>{on?.level != null ? `+${on.level} / ` : ""}{l.value ?? ""}</small></span>{/each}</div>
      {#each plan.options as o (o.fixed.length)}<ol class="steps"><li class="first">
        <span class="n">{o.fixed.length}</span>
        <span class="what">Transmute picking <b>{o.fixed.join(" + ")}</b> <span class="dim">· {o.crystals} crystals + {o.kina.toLocaleString()} Kina{#if o.fixed.every((f) => plan.have.includes(f))} · it has them already: a try only gambles the other {4 - o.fixed.length}{/if}</span></span>
        <span class="try" title="A try beats this arcana's {plan.have.length} best-in-slot skills / lands all of them">{pct1(o.better)} better · {pct1(o.perfect)} all</span>
      </li></ol>{/each}
      {#if !plan.missing.length}<p class="dim m-0">Every best-in-slot skill.</p>
      {:else if !plan.craft}<p class="dim m-0">Farm a {kind} with {or(plan.missing)}: with 4 skills out of {plan.pool}, one drops with the right ones often enough, a transmute costs too much for its odds.</p>{/if}
      {#if plan.wrong.length}<p class="opt">Levels on the wrong skills ({plan.wrong.map((w) => `${w.name} +${w.level}, list +${w.wanted}`).join(", ")}): find another {kind} with the same skills and feed this one into it. It takes all the XP and draws the levels again.</p>
      {:else if plan.levels != null && !plan.missing.length && x.p.enchant < ARCANA_LEVELS}<p class="opt">Each of the {ARCANA_LEVELS} enhance levels adds +1 to one skill at random: {x.ideal.slice(0, 4).map((l) => l.value).join(" / ")} on the right ones in {pct1(plan.levels)} of arcanas.</p>{/if}
    </li>
  {/each}
</ol>
{#if notUnique.length}<p class="hint">Only a Unique arcana can be transmuted: {notUnique.join(", ")}.</p>{/if}
<p class="hint">How players do it: the Chalice is crafted (Transmute) with its 2 main skills picked, since one dropping with the right ones out of every skill of the class takes great luck; the others are farmed. A transmute draws the 4 skills again, the picked ones for sure, the others equally likely from the arcana's pool, never twice the same; it starts again at +0. "Better" = more best-in-slot skills than now. From the game's Arcana window ({TRANSMUTE_CHECKED}).</p>{/if}
{#if done.length}<p class="hint">Nothing worth rerolling: {done.map((x) => x.p.name).join(", ")}.</p>{/if}
<p class="hint">A line is worth the share of top {className}s in Korea carrying it on that slot{players ? ` (${players} players)` : ""}, from <a class="underline" href={source.sourceUrl} target="_blank" rel="noopener">{source.source}</a> ({source.captured}); skill lines, your own choice, their % in your best-in-slot list. A line under {KEEP}% is rerolled; a try lands when it gives any line of {KEEP}% or more the piece lacks. One try = a Sync Stone or a gold piece of gear, on one line: it never lands a line the piece already has. Chances from the game's reroll window (read {REROLL_CHECKED}); where a value fell in its range isn't counted. Pieces first by score gained per expected try; within one, the least likely line first. Bracelets: the Soul Binding lines (level 70 and up). Arcana can't be rerolled.</p>

<style>
  .ups { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 12px; }
  .up { --e: var(--edge, var(--muted-foreground)); display: grid; gap: 10px; padding: 14px 16px; border-radius: var(--r-lg); font-size: var(--fs-sm);
    background: linear-gradient(160deg, color-mix(in srgb, var(--e) 10%, var(--card)) 0%, var(--card) 60%);
    border: 1px solid color-mix(in srgb, var(--e) 40%, transparent); }
  .up.next { border-color: color-mix(in srgb, var(--star) 60%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--star) 25%, transparent), 0 8px 24px -12px color-mix(in srgb, var(--chart-4) 60%, transparent); }
  header { display: flex; align-items: center; gap: 12px; }
  .icon { position: relative; width: 44px; height: 44px; flex: none; border-radius: var(--r-md); background: color-mix(in srgb, var(--background) 60%, transparent); }
  .icon img { width: 44px; height: 44px; border-radius: var(--r-md); }
  .icon i { position: absolute; right: -6px; bottom: -6px; padding: 0 4px; border-radius: 6px; font-size: var(--fs-xs); font-weight: 700; font-style: normal;
    line-height: 1.4; color: var(--background); background: var(--gold); }
  .title { display: grid; gap: 1px; min-width: 0; }
  .title > b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-md); }
  .title small { color: var(--muted-foreground); }
  .title .after { color: var(--star); }
  .badge { justify-self: start; padding: 1px 8px; border-radius: 999px; font-size: var(--fs-xs); font-weight: 700; color: var(--background); background: var(--foreground); }
  .bar { position: relative; height: 8px; border-radius: 4px; background: color-mix(in srgb, var(--foreground) 8%, transparent); overflow: hidden; }
  .bar .now { position: absolute; inset: 0 auto 0 0; width: var(--now); background: var(--gold); border-radius: 4px; }
  .bar .gain { position: absolute; top: 0; bottom: 0; left: var(--now); width: calc(var(--after) - var(--now)); border-radius: 0 4px 4px 0;
    background: linear-gradient(90deg, var(--chart-5), var(--star), var(--chart-2), var(--chart-4)); opacity: .85; }
  .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .steps li { display: grid; grid-template-columns: 22px 1fr auto; gap: 10px; align-items: center; padding: 6px 10px; border-radius: 999px;
    background: color-mix(in srgb, var(--foreground) 4%, transparent); border: 1px solid transparent; }
  .steps li.first { border-color: color-mix(in srgb, var(--star) 55%, transparent); }
  .n { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; font-size: var(--fs-xs); font-weight: 700; color: var(--background);
    background: linear-gradient(135deg, var(--chart-5), var(--star), var(--chart-2)); }
  .what { min-width: 0; }
  .try { color: var(--muted-foreground); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .dim { color: var(--muted-foreground); }
  .tiers { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; align-items: center; }
  .tier { font-size: var(--fs-xs); font-weight: 700; color: var(--muted-foreground); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip.good { color: var(--chart-4); background: color-mix(in srgb, var(--chart-4) 14%, transparent); border-color: color-mix(in srgb, var(--chart-4) 30%, transparent); }
  .chip.fine { color: var(--muted-foreground); background: color-mix(in srgb, var(--foreground) 6%, transparent); border-color: color-mix(in srgb, var(--foreground) 12%, transparent); }
  .chip { display: inline-flex; gap: 6px; align-items: baseline; padding: 2px 10px; border-radius: 999px; font-size: var(--fs-xs); font-weight: 600;
    color: var(--gold); background: color-mix(in srgb, var(--gold) 14%, transparent); border: 1px solid color-mix(in srgb, var(--gold) 30%, transparent); }
  .chip small { color: var(--muted-foreground); font-weight: 400; }
  .opt { margin: 0; font-size: var(--fs-xs); color: var(--chart-4); }
</style>
