<script lang="ts">
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

{#snippet named(m: { name: string; note?: string })}<span class="name">{m.name}</span>{#if m.note}<small>{m.note}</small>{/if}{/snippet}
{#snippet sw(on: boolean, label: string, change: (on: boolean) => void)}<label class="switch"><input type="checkbox" checked={on} aria-label={label}
  onchange={(e) => act(() => change(e.currentTarget.checked))}></label>{/snippet}
<!-- One pip per step: click a step to mark the steps up to it done, click the last done step again to undo it. -->
{#snippet pips(name: string, steps: number, done: number, set: (n: number) => void)}<span class="pips" role="group" aria-label="{name} steps done">
  {#each Array.from({ length: steps }, (_, k) => k + 1) as k}<button class="pip" class:on={k <= done} aria-label="Step {k}" aria-pressed={k <= done}
    title="Step {k}" onclick={() => act(() => set(k === done ? k - 1 : k))}></button>{/each}<span class="pip-n">{done}/{steps}</span></span>{/snippet}
{#snippet coins(c: { coins: number; exact: boolean })}{#if !c.exact}<span class="est" title="Estimate: the coins of each step are not known, only the mission total">≈</span>{/if}{num(c.coins)}{/snippet}

{#if sum.seasonalRemaining <= 0}<section class="win"><div><h2>Seasonal coins: all claimed</h2><p>Only weekly missions left.</p></div></section>{/if}<div class="kpis">
  <Kpi label="Realistic at season end" value={num(sum.realisticEnd)} sub="counted missions only" cls="hero" />
  <Kpi label="Max at season end" value={num(sum.maxAtEnd)} sub="every mission" />
  <Kpi label="Seasonal left" value={num(sum.seasonalRemaining)} sub="of {num(total)}" />
  <button class="kpi kpi-btn" aria-expanded={showWeek} onclick={() => (showWeek = !showWeek)}><small>Still to claim this week</small>
    <b>{left.exact ? "" : "≈"}{num(left.coins)}</b><span>{left.list.length} missions · {showWeek ? "hide" : "show"} which</span></button>
</div>
{#if showWeek}<section class="week-left"><h2>Still to claim this week <span class="count">{left.exact ? "" : "≈"}{num(left.coins)}</span></h2>
  {#if left.list.length}<div class="scroll"><table class="sheet">
    <thead><tr><th>Tab</th><th>Mission</th><th>Done</th><th class="n">Left</th></tr></thead>
    <tbody>{#each left.list as x (x.m.name)}<tr><td class="dim">{x.m.tab}</td><td>{@render named(x.m)}</td><td class="n">{x.done}/{x.m.steps}</td>
      <td class="n">{@render coins({ coins: x.left, exact: x.exact })}</td></tr>{/each}</tbody></table></div>
  {:else}<p class="hint">Everything counted is claimed this week.</p>{/if}</section>{/if}
<div class="settings"><div>
  <section class="wallet"><h2>Wallet</h2>
    <label class="setting"><span>Current coins</span><input type="number" inputmode="numeric" min="0" step="10" value={s.coins}
      onchange={(e) => commit(e, (v) => setCoins(ui.data, ui.charId, v), () => s.coins)}></label>
    <dl class="calc">
      <dt>Still to claim this week</dt><dd>{left.exact ? "" : "≈"}{num(sum.thisWeek)}</dd>
      <dt>Total obtainable</dt><dd>{num(sum.totalObtainable)}</dd>
      <dt>Not counted left</dt><dd>{num(sum.hardPvpRemaining)}</dd>
      <dt>Realistic obtainable</dt><dd>{num(sum.realistic)}</dd>
      <dt>Weekly AP</dt><dd>{num(sum.weeklyAp)}</dd>
    </dl>
    <p class="hint">{SEASON.name} ends {end} · {weeks} weekly resets left · tick the steps you have done below.
      ≈ = estimate: only each mission's total is known, not the coins of every step.</p>
  </section></div><div>
  <section><h2>By tab</h2><div class="scroll"><table class="sheet">
    <thead><tr><th>Tab</th><th class="n">Weekly</th><th class="n">Seasonal</th><th class="n">Left</th></tr></thead>
    <tbody>{#each sum.tabs as t}<tr><td>{t.tab}</td><td class="n">{num(t.weekly)}</td><td class="n">{num(t.total)}</td><td class="n">{num(t.remaining)}</td></tr>{/each}</tbody>
    <tfoot><tr><td>Total</td><td class="n">{num(sum.weeklyCoins)}</td><td class="n">{num(total)}</td><td class="n">{num(sum.seasonalRemaining)}</td></tr></tfoot>
  </table></div></section></div></div>
{#each sum.tabs as t}<section><h2>{t.tab} <span class="count">{num(t.remaining)} left</span></h2><div class="scroll"><table class="sheet season">
  <thead><tr><th>Mission</th><th>Steps done</th><th class="n">AP</th><th class="n">Claimed</th><th class="n">Left</th><th class="c">Counted</th></tr></thead>
  <tbody>{#each missions.filter((x) => x.m.tab === t.tab) as { m, i }}{@const c = claimedOf(m, s)}{@const rem = remainingOf(m, s)}{@const done = stepsOf(m, s)}
    <tr class:done={rem <= 0} class:off={!isCounted(m, s)}>
    <td><button class="mission" title={done >= m.steps ? "Mark as not done" : "Mark as done"} onclick={() => act(() => setSteps(ui.data, ui.charId, i, done >= m.steps ? 0 : m.steps))}>{@render named(m)}</button></td>
    <td>{@render pips(m.name, m.steps, done, (n) => setSteps(ui.data, ui.charId, i, n))}</td>
    <td class="n">{m.ap ? num(m.ap) : "–"}</td>
    <td class="n">{@render coins(c)} <span class="of">/ {num(m.coins)}</span></td>
    <td class="n">{rem > 0 ? num(rem) : "–"}</td>
    <td class="c">{@render sw(isCounted(m, s), `Count ${m.name}`, (on) => setCounted(ui.data, ui.charId, i, on))}</td></tr>{/each}</tbody></table></div></section>{/each}
<section><h2>Weekly missions <span class="count">{num(sum.weeklyCoins)} / week</span></h2><div class="scroll"><table class="sheet season">
  <thead><tr><th>Tab</th><th>Mission</th><th>Done this week</th><th class="n">Coins</th><th class="n">AP</th><th class="c">Counted</th></tr></thead>
  <tbody>{#each WEEKLY as m, i}{@const done = weekStepsOf(m, s, week)}<tr class:off={!isIncluded(m, s)} class:done={done >= m.steps}>
    <td class="dim">{m.tab}</td>
    <td><button class="mission" title={done >= m.steps ? "Mark as not done" : "Mark as done"} onclick={() => act(() => setWeekSteps(ui.data, ui.charId, i, done >= m.steps ? 0 : m.steps, week))}>{@render named(m)}</button></td>
    <td>{@render pips(m.name, m.steps, done, (n) => setWeekSteps(ui.data, ui.charId, i, n, week))}</td>
    <td class="n">{@render coins(stepCoins(m.coins, m.steps, done))} <span class="of">/ {num(m.coins)}</span></td><td class="n">{m.ap ? num(m.ap) : "–"}</td>
    <td class="c">{@render sw(isIncluded(m, s), `Count ${m.name}`, (on) => setIncluded(ui.data, ui.charId, i, on))}</td></tr>{/each}</tbody></table></div>
  <p class="hint">The weekly ticks clear by themselves at the weekly reset.</p></section>
