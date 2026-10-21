<script lang="ts">
  // Event alert lead times: 1–3 editable minute fields + a preview of when the next alerts arrive.
  import { EVENTS, RESET_CONFIG as C } from "../../config.ts";
  import { addLead, removeLead, setLead } from "../../app/settings.ts";
  import { nextEvent } from "../../domain/time.ts";
  import { act, commit } from "../actions.ts";
  import { hm } from "../format.ts";
  import { ui } from "../state.svelte.ts";

  let { id, leads, on }: { id: string; leads: number[]; on: boolean } = $props();

  const ev = $derived(EVENTS.find((e) => e.id === id)!);
  const minute = $derived(Math.floor(ui.now / 60_000));
  const next = $derived.by(() => { void minute; return nextEvent(ev, Date.now(), C.timeZone); });
</script>

<div class="leads">
  {#each leads as m, i}<span class="lead"><input type="number" inputmode="numeric" min="1" max="60" value={m} aria-label="{ev.name} alert {i + 1}, minutes before"
      onchange={(e) => commit(e, (v) => setLead(ui.data, id, i, v), () => ui.data.settings.channels[id].leads![i])}>min
    {#if leads.length > 1}<button class="ghost" aria-label="Remove {m} min alert" title="Remove" onclick={() => act(() => removeLead(ui.data, id, i))}>×</button>{/if}</span>{/each}
  {#if leads.length < 3}<button class="ghost" title="Up to 3 alerts" onclick={() => act(() => addLead(ui.data, id))}>+ Add</button>{/if}
  {#if on}<span class="hint">Next: {leads.map((m) => hm(next - m * 60_000)).join(" · ")}</span>{/if}</div>
