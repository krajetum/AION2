<script lang="ts">
  // Alert lead times: 1–3 editable minute fields + (when `next` is given) a preview of when the next alerts arrive.
  // The owner (an event channel in Settings, a boss alert) passes how to change them.
  import { act, commit } from "../actions.ts";
  import { hm } from "../format.ts";

  let { label, leads, next, onadd, onremove, onset }: {
    label: string; leads: number[]; next?: number;
    onadd: () => void; onremove: (i: number) => void; onset: (i: number, v: string) => void;
  } = $props();
</script>

<div class="leads">
  {#each leads as m, i}<span class="lead"><input type="number" inputmode="numeric" min="1" max="60" value={m} aria-label="{label} alert {i + 1}, minutes before"
      onchange={(e) => commit(e, (v) => onset(i, v), () => leads[i])}>min
    {#if leads.length > 1}<button class="ghost" aria-label="Remove {m} min alert" title="Remove" onclick={() => act(() => onremove(i))}>×</button>{/if}</span>{/each}
  {#if leads.length < 3}<button class="ghost" title="Up to 3 alerts" onclick={() => act(onadd)}>+ Add</button>{/if}
  {#if next}<span class="hint">Next: {leads.map((m) => hm(next - m * 60_000)).join(" · ")}</span>{/if}</div>
