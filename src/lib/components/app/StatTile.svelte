<script lang="ts">
  // A number with its label and a small coloured line under it (the fight's DPS, HPS, damage taken, deaths).
  import { cn } from "$lib/utils.js";
  let { label, value, sub = "", tone = "", active = false, title = "" }: {
    label: string; value: string; sub?: string; tone?: "" | "dps" | "hps" | "taken"; active?: boolean; title?: string;
  } = $props();
  const TONE = { "": "text-foreground", dps: "text-dps", hps: "text-hps", taken: "text-taken" };
  const LINE = { "": "bg-foreground", dps: "bg-dps", hps: "bg-hps", taken: "bg-taken" };
</script>

<div class="relative min-w-0 px-4 py-3" {title}>
  <div class="text-xs text-muted-foreground">{label}</div>
  <div class={cn("text-2xl font-semibold tabular-nums", tone ? TONE[tone] : "")}>{value}</div>
  {#if sub}<div class="truncate text-xs text-muted-foreground tabular-nums">{sub}</div>{/if}
  {#if active}<span class={cn("absolute inset-x-4 bottom-0 h-0.5 rounded-full", LINE[tone])}></span>{/if}
</div>
