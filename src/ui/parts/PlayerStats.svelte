<script lang="ts">
  // A player's advanced stats in a fight: damage, hits and crit rate, healing, deaths (and when), damage taken.
  import { advancedStats, type PlayerRow } from "../../domain/meter.ts";

  let { row, ms }: { row: PlayerRow; ms: number } = $props();
  const stats = $derived(advancedStats(row, ms));
</script>

<dl class="mt-1 mb-2 grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-1.5">{#each stats as s (s.label)}<div class="min-w-0 rounded-lg border bg-card px-2.5 py-2">
  <dt class="text-xs text-muted-foreground">{s.label}</dt><dd class="m-0 font-semibold tabular-nums">{s.value}</dd>{#if s.sub}<dd class="m-0 text-xs break-words text-muted-foreground">{s.sub}</dd>{/if}</div>{/each}</dl>
