<script lang="ts">
  import { RESET_CONFIG as C, SEASON } from "../../config.ts";
  import { setClaimed, setCoins, setHardPvp, setIncluded, setThisWeek } from "../../app/season.ts";
  import { emptySeason, isHardPvp, isIncluded, remainingOf, SEASONAL, seasonSummary, WEEKLY, weeksLeft } from "../../domain/season.ts";
  import { act, commit } from "../actions.ts";
  import { num } from "../format.ts";
  import { MEME } from "../memes.ts";
  import Kpi from "../parts/Kpi.svelte";
  import Meme from "../parts/Meme.svelte";
  import { ui } from "../state.svelte.ts";

  const s = $derived(ui.data.season[ui.charId] ?? emptySeason()); // App creates the entry
  const minute = $derived(Math.floor(ui.now / 60_000));
  const weeks = $derived.by(() => { void minute; return weeksLeft(Date.now(), C, SEASON.end); });
  const sum = $derived(seasonSummary(s, weeks));
  const total = SEASONAL.reduce((a, m) => a + m.coins, 0);
  const end = new Date(SEASON.end + "T00:00").toLocaleDateString("en-GB", { dateStyle: "medium" });
  const missions = SEASONAL.map((m, i) => ({ m, i }));
</script>

{#snippet named(m: { name: string; note?: string })}<span class="name">{m.name}</span>{#if m.note}<small>{m.note}</small>{/if}{/snippet}
{#snippet sw(on: boolean, label: string, change: (on: boolean) => void)}<label class="switch"><input type="checkbox" checked={on} aria-label={label}
  onchange={(e) => act(() => change(e.currentTarget.checked))}></label>{/snippet}

{#if sum.seasonalRemaining <= 0}<section class="win"><Meme src={MEME.win} w={120} h={90} /><div><h2>Seasonal coins: 100% looted</h2><p>Only weeklies left. Touch grass, come back Wednesday.</p></div></section>{/if}<div class="kpis">
  <Kpi label="Realistic at season end" value={num(sum.realisticEnd)} sub="no sweaty PvP" cls="hero" />
  <Kpi label="Max at season end" value={num(sum.maxAtEnd)} sub="if you PvP like a god" />
  <Kpi label="Seasonal left" value={num(sum.seasonalRemaining)} sub="of {num(total)}" />
  <Kpi label="Weekly income" value={num(sum.weeklyCoins)} sub="× {weeks} weeks = {num(sum.futureWeekly)}" />
</div>
<div class="settings"><div>
  <section class="wallet"><h2>Wallet</h2>
    <label class="setting"><span>Current coins</span><input type="number" inputmode="numeric" min="0" step="10" value={s.coins}
      onchange={(e) => commit(e, (v) => setCoins(ui.data, ui.charId, v), () => s.coins)}></label>
    <label class="setting"><span>Still to claim this week</span><input type="number" inputmode="numeric" min="0" step="10" value={s.thisWeek}
      onchange={(e) => commit(e, (v) => setThisWeek(ui.data, ui.charId, v), () => s.thisWeek)}></label>
    <dl class="calc">
      <dt>Total obtainable</dt><dd>{num(sum.totalObtainable)}</dd>
      <dt>Hard PvP left</dt><dd>{num(sum.hardPvpRemaining)}</dd>
      <dt>Realistic obtainable</dt><dd>{num(sum.realistic)}</dd>
      <dt>Weekly AP</dt><dd>{num(sum.weeklyAp)}</dd>
    </dl>
    <p class="hint">{SEASON.name} ends {end} · {weeks} weekly resets left</p>
  </section></div><div>
  <section><h2>By tab</h2><div class="scroll"><table class="sheet">
    <thead><tr><th>Tab</th><th class="n">Weekly</th><th class="n">Seasonal</th><th class="n">Left</th></tr></thead>
    <tbody>{#each sum.tabs as t}<tr><td>{t.tab}</td><td class="n">{num(t.weekly)}</td><td class="n">{num(t.total)}</td><td class="n">{num(t.remaining)}</td></tr>{/each}</tbody>
    <tfoot><tr><td>Total</td><td class="n">{num(sum.weeklyCoins)}</td><td class="n">{num(total)}</td><td class="n">{num(sum.seasonalRemaining)}</td></tr></tfoot>
  </table></div></section></div></div>
{#each sum.tabs as t}<section><h2>{t.tab} <span class="count">{num(t.remaining)} left</span></h2><div class="scroll"><table class="sheet">
  <thead><tr><th>Mission</th><th class="n">Steps</th><th class="n">AP</th><th>Claimed</th><th class="n">Left</th><th class="c">Hard PvP</th></tr></thead>
  <tbody>{#each missions.filter((x) => x.m.tab === t.tab) as { m, i }}{@const c = s.claimed[m.name] ?? 0}{@const rem = remainingOf(m, s)}<tr class={rem <= 0 ? "done" : ""}>
    <td>{@render named(m)}</td><td class="n">{m.steps}</td><td class="n">{m.ap ? num(m.ap) : "–"}</td>
    <td><div class="goal {rem <= 0 ? 'ok' : ''}"><div class="stepper">
      <input type="number" inputmode="numeric" min="0" max={m.coins} step="10" value={c} aria-label="{m.name} coins claimed"
        onchange={(e) => commit(e, (v) => setClaimed(ui.data, ui.charId, i, v), () => s.claimed[m.name] ?? 0)}>
      <span class="of">/ {num(m.coins)}</span></div>
      <div class="bar"><i style="--p:{Math.min(1, c / m.coins)}"></i></div></div></td>
    <td class="n {rem < 0 ? 'neg' : ''}">{rem ? num(rem) : "–"}</td>
    <td class="c">{@render sw(isHardPvp(m, s), `${m.name} is hard PvP`, (on) => setHardPvp(ui.data, ui.charId, i, on))}</td></tr>{/each}</tbody></table></div></section>{/each}
<section><h2>Weekly missions <span class="count">{num(sum.weeklyCoins)} / week</span></h2><div class="scroll"><table class="sheet">
  <thead><tr><th>Tab</th><th>Mission</th><th class="n">Steps</th><th class="n">Coins</th><th class="n">AP</th><th class="c">Counted</th></tr></thead>
  <tbody>{#each WEEKLY as m, i}<tr class={isIncluded(m, s) ? "" : "off"}>
    <td class="dim">{m.tab}</td><td>{@render named(m)}</td><td class="n">{m.steps}</td>
    <td class="n">{num(m.coins)}</td><td class="n">{m.ap ? num(m.ap) : "–"}</td>
    <td class="c">{@render sw(isIncluded(m, s), `Count ${m.name}`, (on) => setIncluded(ui.data, ui.charId, i, on))}</td></tr>{/each}</tbody></table></div></section>
