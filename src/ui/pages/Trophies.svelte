<script lang="ts">
  import { Progress } from "$lib/components/ui/progress/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
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

<div class="mb-3 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
  <Kpi label="Stars" value="{total.earned}/{total.total}" sub="one for every tier reached" cls="hero" />
  <Kpi label="Trophies complete" value="{list.filter((t) => nextTier(t) === null).length}/{list.length}" sub="every tier earned" />
</div>

<div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
  {#each list as t (t.id)}{@const s = stars(t)}{@const next = nextTier(t)}
    <Panel title={t.name} count="{num(t.value)}{next === null ? '' : ` / ${num(next)}`}" class="mb-0">
      <p class="m-0 text-xs text-muted-foreground">{t.what}</p>
      <div class="mt-3 mb-2 flex gap-3" role="img" aria-label="{s} of {t.tiers.length} stars">
        {#each t.tiers as n, i}<span class="grid justify-items-center text-xl leading-none {i < s ? 'text-star' : 'text-input'}">★<small class="mt-1 text-xs text-muted-foreground tabular-nums">{num(n)}</small></span>{/each}
      </div>
      <Progress value={progress(t) * 100} class={next === null ? "[&>[data-slot=progress-indicator]]:bg-hps" : ""} />
    </Panel>
  {/each}
</div>
<p class="hint">Counted from what the companion keeps on this PC: the DPS Log, the arena log, your pets and cubes. Oath keeper and
  Perfect days are {char || "the selected character"}'s.</p>
