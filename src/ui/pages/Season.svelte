<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  import { RESET_CONFIG as C, SEASON } from "../../config.ts";
  import { setCoins, setCounted, setIncluded, setSteps, setWeekSteps } from "../../app/season.ts";
  import {
    claimedOf, emptySeason, isCounted, isIncluded, remainingOf, SEASONAL, seasonSummary, stepCoins, stepsOf, weekLeft, WEEKLY, weekStepsOf, weeksLeft,
  } from "../../domain/season.ts";
  import { lastBoundary } from "../../domain/time.ts";
  import { act, commit } from "../actions.ts";
  import { num } from "../format.ts";
  import Kpi from "../parts/Kpi.svelte";
  import { ui } from "../state.svelte.ts";

  const s = $derived(ui.data.season[ui.charId] ?? emptySeason()); // App creates the entry
  const minute = $derived(Math.floor(ui.now / 60_000));
  const weeks = $derived.by(() => { void minute; return weeksLeft(Date.now(), C, SEASON.end); });
  const week = $derived.by(() => { void minute; return lastBoundary("weekly", Date.now(), C); }); // the weekly ticks belong to this reset
  const sum = $derived(seasonSummary(s, weeks, week));
  const left = $derived(weekLeft(s, week));
  const total = SEASONAL.reduce((a, m) => a + m.coins, 0);
  const end = new Date(SEASON.end + "T00:00").toLocaleDateString("en-GB", { dateStyle: "medium" });
  const missions = SEASONAL.map((m, i) => ({ m, i }));
  let showWeek = $state(false);
</script>

{#snippet named(m: { name: string; note?: string })}<span class="font-medium">{m.name}</span>{#if m.note}<small class="block text-xs text-muted-foreground">{m.note}</small>{/if}{/snippet}
{#snippet sw(on: boolean, label: string, change: (on: boolean) => void)}<Switch checked={on} aria-label={label} onCheckedChange={(v) => act(() => change(v))} />{/snippet}
<!-- One pip per step: click a step to mark the steps up to it done, click the last done step again to undo it. -->
{#snippet pips(name: string, steps: number, done: number, set: (n: number) => void)}<span class="inline-flex flex-wrap items-center gap-[3px]" role="group" aria-label="{name} steps done">
  {#each Array.from({ length: steps }, (_, k) => k + 1) as k}<button data-slot="pip" class="size-3.5 rounded-sm border transition-colors {k <= done ? 'border-primary bg-primary' : 'border-input hover:border-primary'}" aria-label="Step {k}" aria-pressed={k <= done}
    title="Step {k}" onclick={() => act(() => set(k === done ? k - 1 : k))}></button>{/each}<span class="ml-1.5 text-xs text-muted-foreground tabular-nums">{done}/{steps}</span></span>{/snippet}
{#snippet coins(c: { coins: number; exact: boolean })}{#if !c.exact}<span class="mr-0.5 cursor-help text-gold" title="Estimate: the coins of each step are not known, only the mission total">≈</span>{/if}{num(c.coins)}{/snippet}
{#snippet mission(m: { name: string; note?: string }, done: number, steps: number, set: (n: number) => void)}<button data-slot="mission" class="group text-left" title={done >= steps ? "Mark as not done" : "Mark as done"}
  onclick={() => act(() => set(done >= steps ? 0 : steps))}><span class="group-hover:underline">{@render named(m)}</span></button>{/snippet}

{#if sum.seasonalRemaining <= 0}<Card.Root class="mb-3 border-hps/30 bg-hps/10 px-4 py-3"><h2 class="m-0 text-base font-semibold text-hps">Seasonal coins: all claimed</h2><p class="m-0 text-sm text-muted-foreground">Only weekly missions left.</p></Card.Root>{/if}
<div class="mb-3 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
  <Kpi label="Realistic at season end" value={num(sum.realisticEnd)} sub="counted missions only" cls="hero" />
  <Kpi label="Max at season end" value={num(sum.maxAtEnd)} sub="every mission" />
  <Kpi label="Seasonal left" value={num(sum.seasonalRemaining)} sub="of {num(total)}" />
  <button data-slot="kpi-button" class="flex flex-col gap-0.5 rounded-xl bg-card px-4 py-3 text-left ring-1 ring-foreground/10 transition-colors hover:bg-accent" aria-expanded={showWeek} onclick={() => (showWeek = !showWeek)}>
    <span class="text-xs text-muted-foreground">Still to claim this week</span><span class="text-2xl font-semibold tabular-nums">{left.exact ? "" : "≈"}{num(left.coins)}</span>
    <span class="text-xs text-muted-foreground">{left.list.length} missions · {showWeek ? "hide" : "show"} which</span></button>
</div>
{#if showWeek}<Panel title="Still to claim this week" count="{left.exact ? '' : '≈'}{num(left.coins)}">
  {#if left.list.length}<Table.Root>
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Tab</Table.Head><Table.Head>Mission</Table.Head><Table.Head>Done</Table.Head><Table.Head class="text-right">Left</Table.Head></Table.Row></Table.Header>
    <Table.Body>{#each left.list as x (x.m.name)}<Table.Row><Table.Cell class="text-muted-foreground">{x.m.tab}</Table.Cell><Table.Cell class="whitespace-normal">{@render named(x.m)}</Table.Cell><Table.Cell>{x.done}/{x.m.steps}</Table.Cell>
      <Table.Cell class="text-right">{@render coins({ coins: x.left, exact: x.exact })}</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
  {:else}<p class="hint">Everything counted is claimed this week.</p>{/if}</Panel>{/if}
<div class="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-start gap-x-3">
  <Panel title="Wallet">
    <label class="flex items-center justify-between gap-3 text-sm"><span>Current coins</span><Input class="w-32" type="number" inputmode="numeric" min="0" step="10" value={s.coins}
      onchange={(e) => commit(e, (v) => setCoins(ui.data, ui.charId, v), () => s.coins)} /></label>
    <dl class="mt-3 border-t pt-3 text-sm [&_dd]:text-right [&_dd]:tabular-nums">
      <dt>Still to claim this week</dt><dd>{left.exact ? "" : "≈"}{num(sum.thisWeek)}</dd>
      <dt>Total obtainable</dt><dd>{num(sum.totalObtainable)}</dd>
      <dt>Not counted left</dt><dd>{num(sum.hardPvpRemaining)}</dd>
      <dt>Realistic obtainable</dt><dd>{num(sum.realistic)}</dd>
      <dt>Weekly AP</dt><dd>{num(sum.weeklyAp)}</dd>
    </dl>
    <p class="hint">{SEASON.name} ends {end} · {weeks} weekly resets left · tick the steps you have done below.
      ≈ = estimate: only each mission's total is known, not the coins of every step.</p>
  </Panel>
  <Panel title="By tab"><Table.Root>
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Tab</Table.Head><Table.Head class="text-right">Weekly</Table.Head><Table.Head class="text-right">Seasonal</Table.Head><Table.Head class="text-right">Left</Table.Head></Table.Row></Table.Header>
    <Table.Body>{#each sum.tabs as t}<Table.Row><Table.Cell>{t.tab}</Table.Cell><Table.Cell class="text-right">{num(t.weekly)}</Table.Cell><Table.Cell class="text-right">{num(t.total)}</Table.Cell><Table.Cell class="text-right">{num(t.remaining)}</Table.Cell></Table.Row>{/each}</Table.Body>
    <Table.Footer><Table.Row><Table.Cell>Total</Table.Cell><Table.Cell class="text-right">{num(sum.weeklyCoins)}</Table.Cell><Table.Cell class="text-right">{num(total)}</Table.Cell><Table.Cell class="text-right">{num(sum.seasonalRemaining)}</Table.Cell></Table.Row></Table.Footer>
  </Table.Root></Panel>
</div>
{#each sum.tabs as t}<Panel title={t.tab} count="{num(t.remaining)} left"><Table.Root>
  <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Mission</Table.Head><Table.Head>Steps done</Table.Head><Table.Head class="text-right">AP</Table.Head><Table.Head class="text-right">Claimed</Table.Head><Table.Head class="text-right">Left</Table.Head><Table.Head class="w-px text-center">Counted</Table.Head></Table.Row></Table.Header>
  <Table.Body>{#each missions.filter((x) => x.m.tab === t.tab) as { m, i }}{@const c = claimedOf(m, s)}{@const rem = remainingOf(m, s)}{@const done = stepsOf(m, s)}
    <Table.Row class="{rem <= 0 ? '[&_.font-medium]:text-hps' : ''} {isCounted(m, s) ? '' : 'opacity-50'}">
    <Table.Cell class="whitespace-normal">{@render mission(m, done, m.steps, (n) => setSteps(ui.data, ui.charId, i, n))}</Table.Cell>
    <Table.Cell>{@render pips(m.name, m.steps, done, (n) => setSteps(ui.data, ui.charId, i, n))}</Table.Cell>
    <Table.Cell class="text-right">{m.ap ? num(m.ap) : "–"}</Table.Cell>
    <Table.Cell class="text-right">{@render coins(c)} <span class="text-muted-foreground">/ {num(m.coins)}</span></Table.Cell>
    <Table.Cell class="text-right">{rem > 0 ? num(rem) : "–"}</Table.Cell>
    <Table.Cell class="text-center">{@render sw(isCounted(m, s), `Count ${m.name}`, (on) => setCounted(ui.data, ui.charId, i, on))}</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root></Panel>{/each}
<Panel title="Weekly missions" count="{num(sum.weeklyCoins)} / week"><Table.Root>
  <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Tab</Table.Head><Table.Head>Mission</Table.Head><Table.Head>Done this week</Table.Head><Table.Head class="text-right">Coins</Table.Head><Table.Head class="text-right">AP</Table.Head><Table.Head class="w-px text-center">Counted</Table.Head></Table.Row></Table.Header>
  <Table.Body>{#each WEEKLY as m, i}{@const done = weekStepsOf(m, s, week)}<Table.Row class="{done >= m.steps ? '[&_.font-medium]:text-hps' : ''} {isIncluded(m, s) ? '' : 'opacity-50'}">
    <Table.Cell class="text-muted-foreground">{m.tab}</Table.Cell>
    <Table.Cell class="whitespace-normal">{@render mission(m, done, m.steps, (n) => setWeekSteps(ui.data, ui.charId, i, n, week))}</Table.Cell>
    <Table.Cell>{@render pips(m.name, m.steps, done, (n) => setWeekSteps(ui.data, ui.charId, i, n, week))}</Table.Cell>
    <Table.Cell class="text-right">{@render coins(stepCoins(m.coins, m.steps, done))} <span class="text-muted-foreground">/ {num(m.coins)}</span></Table.Cell><Table.Cell class="text-right">{m.ap ? num(m.ap) : "–"}</Table.Cell>
    <Table.Cell class="text-center">{@render sw(isIncluded(m, s), `Count ${m.name}`, (on) => setIncluded(ui.data, ui.charId, i, on))}</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
  <p class="hint">The weekly ticks clear by themselves at the weekly reset.</p></Panel>
