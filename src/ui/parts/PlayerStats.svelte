<script lang="ts">
  // A player's advanced stats in a fight: damage, hits and crit rate, healing, deaths (and when), damage taken.
  import { advancedStats, type PlayerRow } from "../../domain/meter.ts";

  let { row, ms }: { row: PlayerRow; ms: number } = $props();
  const stats = $derived(advancedStats(row, ms));
</script>

<dl class="pstats">{#each stats as s (s.label)}<div><dt>{s.label}</dt><dd class="num">{s.value}</dd>{#if s.sub}<dd class="sub">{s.sub}</dd>{/if}</div>{/each}</dl>

<style>
  .pstats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 6px; margin: 4px 0 8px; }
  .pstats div { padding: 8px 10px; background: var(--raised); border-radius: var(--r-card); min-width: 0; }
  dt { color: var(--muted); font-size: var(--fs-sm); }
  dd { margin: 0; }
  .num { font-weight: 600; font-variant-numeric: tabular-nums; }
  .sub { color: var(--muted); font-size: var(--fs-sm); overflow-wrap: anywhere; }
</style>
