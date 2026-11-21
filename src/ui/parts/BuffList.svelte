<script lang="ts">
  // A player's buffs in a boss fight with their uptime: scrolls and food first, then the rest (meter: buffs.rs).
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { buffShare, skillIconUrl, type PlayerRow } from "../../domain/meter.ts";

  let { row, ms }: { row: PlayerRow; ms: number } = $props();
  const consumables = $derived((row.buffs ?? []).filter((b) => b.kind === "scroll" || b.kind === "food"));
  const others = $derived((row.buffs ?? []).filter((b) => b.kind !== "scroll" && b.kind !== "food"));
</script>

{#if row.buffs}
  <h3 class="mt-2.5 mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Buffs</h3>
  {#if row.buffs.length}
    {#each [["Scrolls & food", consumables], ["Buffs", others]] as const as [title, list] (title)}
      {#if list.length}<p class="mt-2 mb-0.5 text-sm font-semibold">{title}</p>
        <ul class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-4 gap-y-0.5 p-0">{#each list as b (b.name)}{@const p = buffShare(b, ms)}
          <li class="grid grid-cols-[minmax(0,1fr)_90px_40px] items-center gap-2 py-0.5 text-sm">
            <span class="flex min-w-0 items-center gap-1.5">{#if b.icon}<img class="size-4.5 flex-none rounded-sm" src={skillIconUrl(b.icon)} alt="" loading="lazy"
              onerror={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}>{:else}<span class="size-4.5 flex-none rounded-sm bg-secondary" aria-hidden="true"></span>{/if}<span class="truncate">{b.name}{#if b.own}<span class="text-muted-foreground"> · self</span>{/if}</span></span>
            <Progress value={p * 100} class="h-1.5 {p >= 0.99 ? '[&>[data-slot=progress-indicator]]:bg-hps' : ''}" />
            <span class="text-right tabular-nums">{Math.round(p * 100)}%</span></li>{/each}</ul>
      {:else if title === "Scrolls & food"}<p class="hint">No scroll or food on this player during the fight.</p>{/if}
    {/each}
  {:else}<p class="hint">No buff long enough to show.</p>{/if}
  <p class="hint">Uptime over the fight's length. Scrolls and food used before the meter saw them count as up the whole fight.</p>
{/if}
