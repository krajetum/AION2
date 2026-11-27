<script lang="ts">
  // Players › Upgrades: one queue, best first ("Up next"): each piece worth improving as a row (score now → expected
  // after, tries, gain) that opens in place on the lines to reroll in order with the chance a try, the wanted lines in
  // tiers, the Philosopher's Stone line and a reset (domain/reroll.ts); then the arcana (domain/arcana.ts) as the same
  // rows; then what is already ideal. One column at any width. The plans come built (domain/upgrades.ts).
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Info from "@lucide/svelte/icons/info";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import Gem from "@lucide/svelte/icons/gem";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import Ban from "@lucide/svelte/icons/ban";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import Dices from "@lucide/svelte/icons/dices";
  import { Button } from "$lib/components/ui/button/index.js";
  import type { Piece } from "../../domain/armory.ts";
  import { ADD_LINE, KEEP, REROLL_CHECKED, type PiecePlan, type RankedLine, type Worth } from "../../domain/reroll.ts";
  import { SKILL_TARGET, TRANSMUTE_CHECKED } from "../../domain/arcana.ts";
  import { ARCANA_KINDS, bisSlot, slotLabel } from "../../domain/bis.ts";
  import type { ArcanaItem, GearPlan, Upgrades } from "../../domain/upgrades.ts";
  import { slotIcon } from "../icons.ts";
  import UpgradeInfo from "./UpgradeInfo.svelte";

  let { up, reading, className, players, source, ranks }: { up: Upgrades; reading: { read: number; total: number } | null; className: string; players: number;
    source: { source: string; sourceUrl: string; captured: string }; ranks?: { tiers: Record<string, number>; source: string; captured: string } } = $props();

  // The lines it can land, in tiers: the static's S / A / B (worth 100 / 80 / 60, a skill line B), or kisk's carry shares.
  const TIERS = [{ name: "Best", min: 90 }, { name: "Good", min: 70 }, { name: "Fine", min: KEEP }];
  // What a chip says: the line's rank (and its note), else its carry share.
  const label = (l: Worth, ranked?: Record<string, RankedLine> | null) =>
    ranked ? (ranked[l.stat]?.rank ?? (l.skill ? "B" : "")) : `${l.pct ?? 100}%`;
  const why = (l: Worth, ranked?: Record<string, RankedLine> | null) => {
    const r = ranked?.[l.stat];
    if (r) return `Rank ${r.rank}${r.note ? `: ${r.note}` : ""}`;
    if (l.skill) return ranked ? "Skill line from your best-in-slot list: rank B" : `Skill: ${l.pct ?? 100}% in your best-in-slot list`;
    return `${l.pct}% of top ${className}s carry it here`;
  };
  const tierOf = (pct: number) => TIERS.find((t) => pct >= t.min)!.name;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const or = (list: string[]) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}` : list[0] ?? "");
  const lacking = (x: { plan: PiecePlan; ideal: Worth[] }) =>
    x.ideal.filter((l) => x.plan.missing.includes(l.stat)).sort((a, b) => (b.pct ?? 100) - (a.pct ?? 100));
  const pct1 = (v: number) => (v >= 0.995 ? "100%" : v >= 0.1 ? `${Math.round(v * 100)}%` : `${(v * 100).toFixed(1)}%`);
  const goodLines = (x: GearPlan) => x.ideal.filter((l) => (l.pct ?? 100) >= KEEP && x.lines.includes(l.stat));

  const arcanaTodo = $derived(up.arcana.filter((x) => x.plan.missing.length || x.plan.wasted.length));
  const arcanaDone = $derived(up.arcana.filter((x) => !x.plan.missing.length && !x.plan.wasted.length));
  // The skills the arcana lists ask for that are already where they should be: actives at 20.
  const skillsDone = $derived([...new Set(up.arcana.flatMap((x) => x.ideal.slice(0, 4).map((l) => l.stat)))]
    .flatMap((n) => (up.totals[n] && !up.totals[n].passive && up.totals[n].level >= SKILL_TARGET ? [{ name: n, level: up.totals[n].level }] : [])));
  const toImprove = $derived(up.todo.length + arcanaTodo.length);
  const total = $derived(up.plans.length + up.arcana.length);
  const tries = $derived(up.todo.reduce((n, x) => n + Math.ceil(x.plan.tries), 0));

  // The row open: undefined = the first one to improve (also once the pieces come in), null = none.
  let picked = $state<string | null | undefined>(undefined), info = $state(false);
  const first = $derived(up.todo[0] ? `g:${up.todo[0].p.slot}` : arcanaTodo[0] ? `a:${arcanaTodo[0].p.slot}` : null);
  const opened = $derived(picked === undefined ? first : picked);
  const toggle = (key: string) => { picked = opened === key ? null : key; };
  const doneTitle = (x: GearPlan) => `${x.p.name} · ${Math.round(x.plan.score)} / 100 · every line worth keeping: ${goodLines(x).map((l) => `${l.stat} (${label(l, x.ranked)})`).join(", ")}`;
  const arcanaDoneTitle = (a: ArcanaItem) => `${a.p.name} · ${ARCANA_KINDS[a.slot] ?? "Arcana"} · every skill wanted, no level wasted: ${a.held.map((h) => `${h.name} +${h.level ?? "?"}`).join(", ")}`;
</script>

{#snippet icon(p: Piece)}{@const I = slotIcon(bisSlot(p.slotName))}<span class="relative grid size-10 shrink-0 place-items-center rounded-md bg-muted">
  {#if p.icon}<img src={p.icon} alt="" class="size-10 rounded-md" loading="lazy">{:else}<I class="size-5 text-muted-foreground" />{/if}
  {#if p.enchant}<span class="absolute -right-1.5 -bottom-1.5 rounded bg-[var(--gold)] px-1 text-[10px] leading-tight font-bold text-background">+{p.enchant}</span>{/if}</span>{/snippet}

{#snippet chev(on: boolean)}<ChevronRight class="size-4 shrink-0 text-muted-foreground transition-transform {on ? 'rotate-90' : ''}" />{/snippet}

<div class="flex flex-col gap-3 text-sm">
  <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
    {#if reading}<span class="text-muted-foreground">Reading the pieces… {reading.read} / {reading.total}</span>{/if}
    {#if total}<span><b>{toImprove}</b> <span class="text-muted-foreground">of {total} worth improving</span></span>{/if}
    {#if tries}<span class="inline-flex items-center gap-1 text-muted-foreground"><Dices class="size-4" />≈{tries} tries for all</span>{/if}
    <Button size="sm" variant="ghost" class="ml-auto" aria-pressed={info} onclick={() => { info = !info; }}><Info />How it's scored</Button>
  </div>
  {#if info}<UpgradeInfo example={up.plans.find((x) => x.plan.steps.length) ?? null} ranked={up.plans.some((x) => x.ranked)} />{/if}

  {#if !up.todo.length && !reading}<p class="hint m-0">Nothing to reroll: every piece has its ideal lines.</p>{/if}
  {#if up.todo.length}<ol class="m-0 flex list-none flex-col gap-2 p-0">
    {#each up.todo as x, i (x.p.slot)}{@const plan = x.plan}{@const want = lacking(x)}{@const key = `g:${x.p.slot}`}{@const on = opened === key}{@const slot = bisSlot(x.p.slotName)}
      <li class="up grade-edge-{x.p.grade} rounded-lg border bg-card" class:next={i === 0}>
        <button type="button" class="flex w-full items-center gap-3 px-3 py-2.5 text-left" aria-expanded={on} onclick={() => toggle(key)}>
          <span class="w-5 shrink-0 text-center text-xs font-bold tabular-nums {i === 0 ? 'text-[var(--star)]' : 'text-muted-foreground'}">{i + 1}</span>
          {@render icon(x.p)}
          <span class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="flex min-w-0 items-center gap-2">{#if i === 0}<span class="next-badge">Up next</span>{/if}<b class="truncate grade-{x.p.grade}">{x.p.name}</b></span>
            <span class="bar" style="--now:{plan.score}%; --after:{plan.after}%" title="Now {Math.round(plan.score)}, ≈{Math.round(plan.after)} after the rerolls"><span class="now"></span><span class="gain"></span></span>
            <span class="text-xs text-muted-foreground">{slot ? slotLabel(slot) : x.p.slotName} · <b class="text-foreground">{Math.round(plan.score)}</b> → <b class="text-[var(--star)]">≈{Math.round(plan.after)}</b> / 100{#if plan.steps.length} · ≈{Math.ceil(plan.tries)} tries{/if}</span>
          </span>
          <span class="shrink-0 text-xs font-semibold text-[var(--ok-ink)] tabular-nums">+{Math.round(plan.after - plan.score)}</span>
          {@render chev(on)}
        </button>
        {#if on}<div class="flex flex-col gap-2.5 border-t px-3 py-3">
          {#if plan.steps.length}<ol class="m-0 flex list-none flex-col gap-1.5 p-0">
            {#each plan.steps as s, k (k)}<li class="step" class:first={k === 0}>
              <span class="n">{k + 1}</span>
              <span class="min-w-0">Reroll <b>{s.line}</b> <span class="text-muted-foreground">→ ideally {or(want.map((l) => l.stat))}</span></span>
              <span class="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{pct(s.chance)} a try</span>
            </li>{/each}
          </ol>
          <p class="m-0 text-muted-foreground">Reroll each until it lands one of these it doesn't have yet:</p>{/if}
          <div class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">{#each TIERS as t (t.name)}{@const these = want.filter((l) => tierOf(l.pct ?? 100) === t.name)}{#if these.length}
            <span class="text-xs font-bold text-muted-foreground">{t.name}</span><div class="flex flex-wrap gap-1.5">{#each these as l (l.stat)}<span class="chip {t.name.toLowerCase()}" title={why(l, x.ranked)}>{l.stat}{#if l.skill} +1{/if}<small>{label(l, x.ranked)}</small></span>{/each}</div>{/if}{/each}</div>
          {#if plan.add || (plan.reset && plan.steps.length)}<div class="grid gap-2 sm:grid-cols-2">
            {#if plan.add}<div class="opt"><Gem class="size-4 shrink-0" /><span>Room for a Philosopher's Stone line ({ADD_LINE.stones} stones + {ADD_LINE.kina.toLocaleString()} Kina): <b>{pct(plan.add.chance)}</b> it lands one of these. Lost when the piece is transferred to a new one.</span></div>{/if}
            {#if plan.reset && plan.steps.length}<div class="opt"><RotateCcw class="size-4 shrink-0" /><span>A reset (300 Kina + 3 Soul Codex: Reset) gives ≈{plan.reset.ideal.toFixed(1)} ideal lines, ≈{Math.round(plan.reset.score)} / 100 on average.</span></div>{/if}
          </div>{/if}
          {#if plan.unobtainable.length}<p class="m-0 flex items-center gap-1.5 text-xs text-muted-foreground"><Ban class="size-3.5 shrink-0" />Not from rerolls ({plan.unobtainable.join(", ")}): top players carry it here, but this slot's draw doesn't give it.</p>{/if}
        </div>{/if}
      </li>{/each}
  </ol>{/if}

  {#if arcanaTodo.length || up.notUnique.length}<h3 class="mt-2 mb-0 flex items-center gap-1.5 text-sm font-semibold"><Sparkles class="size-4 text-muted-foreground" />Arcana</h3>
  {#if arcanaTodo.length}<ol class="m-0 flex list-none flex-col gap-2 p-0">
    {#each arcanaTodo as x (x.p.slot)}{@const plan = x.plan}{@const kind = ARCANA_KINDS[x.slot] ?? "arcana"}{@const key = `a:${x.p.slot}`}{@const on = opened === key}
      <li class="up grade-edge-{x.p.grade} rounded-lg border bg-card">
        <button type="button" class="flex w-full items-center gap-3 px-3 py-2.5 text-left" aria-expanded={on} onclick={() => toggle(key)}>
          <span class="w-5 shrink-0"></span>
          {@render icon(x.p)}
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <b class="truncate grade-{x.p.grade}">{x.p.name}</b>
            <span class="text-xs text-muted-foreground">{kind} · <b class="text-foreground">{plan.have.length}</b> / {plan.have.length + plan.missing.length} best-in-slot skills · {plan.craft ? `craft it: draws from ${plan.pool}` : "farm it"}</span>
          </span>
          {#if plan.missing.length}<span class="shrink-0 text-xs text-muted-foreground">{plan.missing.length} missing</span>{/if}
          {@render chev(on)}
        </button>
        {#if on}<div class="flex flex-col gap-2.5 border-t px-3 py-3">
          <div class="flex flex-wrap gap-1.5">{#each x.ideal.slice(0, 4) as l (l.stat)}{@const held = x.held.find((h) => h.name === l.stat)}{@const t = up.totals[l.stat]}{@const cov = plan.covered.includes(l.stat)}
            <span class="chip {cov ? 'fine' : held ? '' : 'fine'}" class:cov title={cov ? `At ${SKILL_TARGET} without this arcana (gear lines and the other arcana): not needed here` : held ? `On this arcana at +${held.level ?? "?"}` : "Missing"}>{held && !cov ? "✓ " : ""}{l.stat}{#if held?.level != null}<small>+{held.level}</small>{/if}{#if t}<small>Lv {t.level}{t.passive ? "" : ` / ${SKILL_TARGET}`}</small>{/if}{#if cov}<small>not needed</small>{/if}</span>{/each}</div>
          {#each plan.options as o (o.fixed.length)}<div class="step first">
            <span class="n">{o.fixed.length}</span>
            <span class="min-w-0">Transmute picking <b>{o.fixed.join(" + ")}</b> <span class="text-muted-foreground">· {o.crystals} crystals + {o.kina.toLocaleString()} Kina{#if o.fixed.every((f) => plan.have.includes(f))} · it has them already: a try only gambles the other {4 - o.fixed.length}{/if}</span></span>
            <span class="text-xs whitespace-nowrap text-muted-foreground tabular-nums" title="A try beats this arcana's {plan.have.length + plan.missing.length} skills wanted / lands all of them">{pct1(o.better)} better · {pct1(o.perfect)} all</span>
          </div>{/each}
          {#if !plan.missing.length}<p class="m-0 text-muted-foreground">Every best-in-slot skill.</p>
          {:else if !plan.craft}<p class="m-0 text-muted-foreground">Farm a {kind} with {or(plan.missing)}: with 4 skills out of {plan.pool}, one drops with the right ones often enough, a transmute costs too much for its odds.</p>{/if}
          {#if plan.wasted.length}<div class="opt"><RotateCcw class="size-4 shrink-0" /><span>Levels doing nothing: {plan.wasted.map((w) => w.why === "over" ? `${w.name} ${w.levels} past ${SKILL_TARGET}` : `${w.name} +${w.levels} (not wanted here)`).join(", ")}.{#if !plan.missing.length} Find another {kind} with the same skills and feed this one into it: it takes all the XP and draws the levels again.{/if}</span></div>{/if}
        </div>{/if}
      </li>{/each}
  </ol>{/if}
  {#if up.notUnique.length}<p class="hint m-0">Only a Unique arcana can be transmuted: {up.notUnique.join(", ")}.</p>{/if}
  {#if arcanaTodo.length}<p class="hint m-0">The main active skills go to level {SKILL_TARGET}, the main passives as high as they go (levels with every bonus, from the profile): a skill already at {SKILL_TARGET} from gear and the other arcana isn't needed on this one, so what to look for depends on what you have; the cards' skills are one example build. How players do it: the Chalice is crafted (Transmute) with its 2 main skills picked, since one dropping with the right ones out of every skill of the class takes great luck; the others are farmed. A transmute draws the 4 skills again, the picked ones for sure, the others equally likely from the arcana's pool, never twice the same; it starts again at +0. "Better" = more best-in-slot skills than now. From the game's Arcana window ({TRANSMUTE_CHECKED}).</p>{/if}{/if}

  {#if up.done.length || arcanaDone.length || skillsDone.length}<h3 class="mt-2 mb-0 flex items-center gap-1.5 text-sm font-semibold"><CircleCheck class="size-4 text-[var(--ok-ink)]" />Already ideal</h3>
  <div class="flex flex-wrap gap-2">
    {#each up.done as x (x.p.slot)}<span title={doneTitle(x)} aria-label={doneTitle(x)}>{@render icon(x.p)}</span>{/each}
    {#each arcanaDone as a (a.p.slot)}<span title={arcanaDoneTitle(a)} aria-label={arcanaDoneTitle(a)}>{@render icon(a.p)}</span>{/each}
  </div>
  {#if skillsDone.length}<p class="m-0 text-xs text-muted-foreground">Skills at {SKILL_TARGET} with gear and arcana (more on them does nothing): {skillsDone.map((s) => `${s.name} Lv ${s.level}`).join(", ")}.</p>{/if}{/if}

  <p class="hint m-0">{#if ranks}Lines ranked by {ranks.source}'s tables ({ranks.captured}): S best, A good, B fine, the rest rerolled; skill lines, your own best-in-slot choice, rank B. Rings, which the tables leave out: the share of top {className}s in Korea carrying a line{players ? ` (${players} players)` : ""}, from <a class="underline" href={source.sourceUrl} target="_blank" rel="noopener">{source.source}</a> ({source.captured}). A try lands when it gives a line of rank B or better the piece lacks; the Philosopher's Stone line too.{:else}A line is worth the share of top {className}s in Korea carrying it on that slot{players ? ` (${players} players)` : ""}, from <a class="underline" href={source.sourceUrl} target="_blank" rel="noopener">{source.source}</a> ({source.captured}); skill lines, your own choice, their % in your best-in-slot list. A line under {KEEP}% is rerolled; a try lands when it gives any line of {KEEP}% or more the piece lacks.{/if} One try = a Sync Stone or a gold piece of gear, on one line: it never lands a line the piece already has. Chances from the game's reroll window (read {REROLL_CHECKED}); where a value fell in its range isn't counted. Pieces first by what their next try is worth (its chance × the worth it adds); within one, the least likely line first. Bracelets: the Soul Binding lines (level 70 and up). Arcana can't be rerolled.</p>
</div>

<style>
  .up { border-color: color-mix(in srgb, var(--edge, var(--border)) 40%, transparent); }
  .up.next { border-color: color-mix(in srgb, var(--star) 60%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--star) 25%, transparent), 0 8px 24px -12px color-mix(in srgb, var(--chart-4) 60%, transparent); }
  .next-badge { flex: none; padding: 0 8px; border-radius: 999px; font-size: var(--fs-xs); font-weight: 700; color: var(--background); background: var(--foreground); }
  .bar { position: relative; display: block; height: 6px; border-radius: 3px; background: color-mix(in srgb, var(--foreground) 8%, transparent); overflow: hidden; }
  .bar .now { position: absolute; inset: 0 auto 0 0; width: var(--now); background: var(--gold); border-radius: 3px; }
  .bar .gain { position: absolute; top: 0; bottom: 0; left: var(--now); width: calc(var(--after) - var(--now)); border-radius: 0 3px 3px 0;
    background: linear-gradient(90deg, var(--chart-5), var(--star), var(--chart-2), var(--chart-4)); opacity: .85; }
  .step { display: grid; grid-template-columns: 22px 1fr auto; gap: 10px; align-items: center; padding: 6px 10px; border-radius: 999px;
    background: color-mix(in srgb, var(--foreground) 4%, transparent); border: 1px solid transparent; }
  .step.first { border-color: color-mix(in srgb, var(--star) 55%, transparent); }
  .n { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; font-size: var(--fs-xs); font-weight: 700; color: var(--background);
    background: linear-gradient(135deg, var(--chart-5), var(--star), var(--chart-2)); }
  .chip { display: inline-flex; gap: 6px; align-items: baseline; padding: 2px 10px; border-radius: 999px; font-size: var(--fs-xs); font-weight: 600;
    color: var(--gold); background: color-mix(in srgb, var(--gold) 14%, transparent); border: 1px solid color-mix(in srgb, var(--gold) 30%, transparent); }
  .chip.good { color: var(--chart-4); background: color-mix(in srgb, var(--chart-4) 14%, transparent); border-color: color-mix(in srgb, var(--chart-4) 30%, transparent); }
  .chip.fine { color: var(--muted-foreground); background: color-mix(in srgb, var(--foreground) 6%, transparent); border-color: color-mix(in srgb, var(--foreground) 12%, transparent); }
  .chip small { color: var(--muted-foreground); font-weight: 400; }
  .chip.cov { text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--muted-foreground) 60%, transparent); }
  .opt { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border-radius: var(--r-md); font-size: var(--fs-xs); color: var(--chart-4);
    background: color-mix(in srgb, var(--chart-4) 8%, transparent); border: 1px solid color-mix(in srgb, var(--chart-4) 25%, transparent); }
</style>
