<script lang="ts">
  // Alert lead times: 1–3 editable minute fields + (when `next` is given) a preview of when the next alerts arrive.
  // The owner (an event channel in Settings, a boss alert) passes how to change them.
  import X from "@lucide/svelte/icons/x";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { act, commit } from "../actions.ts";
  import { hm } from "../format.ts";

  let { label, leads, next, onadd, onremove, onset }: {
    label: string; leads: number[]; next?: number;
    onadd: () => void; onremove: (i: number) => void; onset: (i: number, v: string) => void;
  } = $props();
</script>

<div class="flex basis-full flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
  {#each leads as m, i}<span class="inline-flex items-center gap-1 whitespace-nowrap"><Input class="h-7 w-14" type="number" inputmode="numeric" min="1" max="60" value={m} aria-label="{label} alert {i + 1}, minutes before"
      onchange={(e) => commit(e, (v) => onset(i, v), () => leads[i])} />min
    {#if leads.length > 1}<Button variant="ghost" size="icon-xs" aria-label="Remove {m} min alert" title="Remove" onclick={() => act(() => onremove(i))}><X /></Button>{/if}</span>{/each}
  {#if leads.length < 3}<Button variant="ghost" size="xs" title="Up to 3 alerts" onclick={() => act(onadd)}>+ Add</Button>{/if}
  {#if next}<span class="ml-auto text-xs">Next: {leads.map((m) => hm(next - m * 60_000)).join(" · ")}</span>{/if}</div>
