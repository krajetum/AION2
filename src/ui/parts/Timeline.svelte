<script lang="ts">
  // Your DPS over a fight (one run) or two runs from the same start, with each run's burst, opener and downtime.
  import { clock, short } from "../../domain/meter.ts";
  import { burst, downtime, opener, smooth } from "../../domain/timeline.ts";

  let { runs }: { runs: { label: string; t: number[] }[] } = $props();
  const W = 600, H = 90;
  const lines = $derived(runs.map((r) => smooth(r.t)));
  const len = $derived(Math.max(2, ...lines.map((l) => l.length)));
  const top = $derived(Math.max(1, ...lines.flat()));
  const points = (l: number[]) => l.map((v, i) => `${((i / (len - 1)) * W).toFixed(1)},${(H - 2 - (v / top) * (H - 6)).toFixed(1)}`).join(" ");
  const at = (s: number) => clock(s * 1000);
</script>

<div class="timeline">
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="Your DPS over the fight">
    {#each lines as l, i}<polyline class:before={runs.length > 1 && i === 0} points={points(l)} />{/each}
  </svg>
  <div class="axis hint"><span>0:00</span><span>peak {short(top)}/s (5 s average)</span><span>{at(len - 1)}</span></div>
  {#each runs as r, i}{@const b = burst(r.t)}{@const d = downtime(r.t)}
    <p class="hint">{#if r.label}<b class:before={runs.length > 1 && i === 0}>{r.label}</b> · {/if}{#if b}Best 10 s: {short(b.dps)}/s at {at(b.at)} ·{" "}{/if}Opener (15 s): {short(opener(r.t))}/s ·
      {#if d.idle}No damage for {d.idle} s{#if d.longest > 1}, the longest {d.longest} s at {at(d.at)}{/if} · {short(d.activeDps)}/s while hitting{:else}No second without damage{/if}</p>{/each}
</div>

<style>
  .timeline { margin: 8px 0; }
  svg { display: block; width: 100%; height: 90px; border-bottom: 1px solid var(--border); }
  polyline { fill: none; stroke: var(--accent); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  polyline.before { stroke: var(--muted); }
  .axis { display: flex; justify-content: space-between; }
  p { margin: 4px 0 0; }
  b { color: var(--accent); }
  b.before { color: var(--muted); }
</style>
