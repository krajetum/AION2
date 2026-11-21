<script lang="ts">
  // Your DPS over a fight (one run) or two runs from the same start, with each run's burst, opener and downtime.
  import FightChart from "$lib/components/charts/FightChart.svelte";
  import { clock, short } from "../../domain/meter.ts";
  import { burst, downtime, opener } from "../../domain/timeline.ts";

  let { runs }: { runs: { label: string; t: number[] }[] } = $props();
  const lines = $derived(runs.map((r, i) => ({ name: r.label || "Your DPS", values: r.t, color: runs.length > 1 && i === 0 ? "--muted-foreground" : "--gold" })));
  const at = (s: number) => clock(s * 1000);
</script>

<div class="my-2">
  <FightChart {lines} height={140} label="Your DPS over the fight" />
  {#each runs as r, i}{@const b = burst(r.t)}{@const d = downtime(r.t)}
    <p class="hint mt-1">{#if r.label}<b class={runs.length > 1 && i === 0 ? "text-muted-foreground" : "text-gold"}>{r.label}</b> · {/if}{#if b}Best 10 s: {short(b.dps)}/s at {at(b.at)} ·{" "}{/if}Opener (15 s): {short(opener(r.t))}/s ·
      {#if d.idle}No damage for {d.idle} s{#if d.longest > 1}, the longest {d.longest} s at {at(d.at)}{/if} · {short(d.activeDps)}/s while hitting{:else}No second without damage{/if}</p>{/each}
</div>
