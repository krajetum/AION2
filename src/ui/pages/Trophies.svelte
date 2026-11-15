<script lang="ts">
  // Trophies (domain/trophies.ts): badges counted from what the app already keeps. Nothing to tick here.
  import { nextTier, progress, stars, tally, trophies } from "../../domain/trophies.ts";
  import { num } from "../format.ts";
  import Kpi from "../parts/Kpi.svelte";
  import { ui } from "../state.svelte.ts";

  // Counted again when the data changes and once an hour (the Advent doors belong to a season), not every second.
  const hour = $derived(Math.floor(ui.now / 3_600_000) * 3_600_000);
  const list = $derived(trophies(ui.data, ui.fights, ui.charId, hour));
  const total = $derived(tally(list));
  const char = $derived(ui.data.characters.find((c) => c.id === ui.charId)?.name ?? "");
</script>

<div class="kpis">
  <Kpi label="Stars" value="{total.earned}/{total.total}" sub="one for every tier reached" cls="hero" />
  <Kpi label="Trophies complete" value="{list.filter((t) => nextTier(t) === null).length}/{list.length}" sub="every tier earned" />
</div>

<div class="trophies">
  {#each list as t (t.id)}{@const s = stars(t)}{@const next = nextTier(t)}
    <section class:full={next === null}>
      <h2>{t.name} <span class="count">{num(t.value)}{next === null ? "" : ` / ${num(next)}`}</span></h2>
      <p class="what">{t.what}</p>
      <div class="tiers" role="img" aria-label="{s} of {t.tiers.length} stars">
        {#each t.tiers as n, i}<span class="tier" class:on={i < s}>★<small>{num(n)}</small></span>{/each}
      </div>
      <div class="bar"><i style:--p={String(progress(t))}></i></div>
    </section>
  {/each}
</div>
<p class="hint">Counted from what the companion keeps on this PC: the Fight Log, the arena log, your pets and cubes. Oath keeper and
  Perfect days are {char || "the selected character"}'s.</p>

<style>
  .trophies { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--gap); }
  .trophies section { margin: 0; }
  .what { margin: 0; color: var(--faint); font-size: var(--fs-sm); }
  .tiers { display: flex; gap: var(--s-3); margin: var(--s-3) 0 var(--s-2); }
  .tier { display: grid; justify-items: center; color: var(--control); font-size: var(--fs-2xl); line-height: 1; }
  .tier small { margin-top: var(--s-1); color: var(--faint); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
  .tier.on { color: var(--star); }
  .full .bar i { background: var(--teal); }
</style>
