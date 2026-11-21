<script lang="ts">
  import { addTrigger, moveTask, removeTrigger, renameTask, setTaskCategory, setTaskEnabled, setTaskGoals, setTaskNote } from "../../app/tasks.ts";
  import { suggest, triggerLabel } from "../../domain/triggers.ts";
  import { formatGoals } from "../../domain/tasks.ts";
  import type { Task } from "../../domain/types.ts";
  import { act, commit } from "../actions.ts";
  import { showStatus } from "../overlays.ts";
  import { ui } from "../state.svelte.ts";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import X from "@lucide/svelte/icons/x";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { NativeSelect, NativeSelectOption } from "$lib/components/ui/native-select/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";

  let { t }: { t: Task } = $props();
  const offer = $derived(suggest(ui.recent, t, ui.now));

  function goals(v: string) {
    try { setTaskGoals(ui.data, t.id, v); } catch (err) { showStatus((err as Error).message, true); }
  }
</script>

<div class="grid grid-cols-[auto_1fr_1fr] items-center gap-2 border-b py-2.5 last:border-0 md:grid-cols-[auto_minmax(90px,1fr)_minmax(140px,2fr)_minmax(120px,1.5fr)_minmax(100px,1.2fr)_auto] {t.enabled ? '' : 'opacity-50'}">
  <span class="flex gap-0.5"><Button variant="outline" size="icon-sm" aria-label="Move up" title="Move up" onclick={() => act(() => moveTask(ui.data, t.id, -1))}><ChevronUp /></Button>
    <Button variant="outline" size="icon-sm" aria-label="Move down" title="Move down" onclick={() => act(() => moveTask(ui.data, t.id, 1))}><ChevronDown /></Button></span>
  <Input value={t.category} aria-label="Category" title="Category" onchange={(e) => commit(e, (v) => setTaskCategory(ui.data, t.id, v), () => t.category)} />
  <Input value={t.name} aria-label="Name" title="Name" onchange={(e) => commit(e, (v) => renameTask(ui.data, t.id, v), () => t.name)} />
  <Input value={formatGoals(t.goals)} placeholder="Goals…" aria-label="Goals" title="E.g. 2000 · Wins:30, Entries:10 · Level:50/5"
    onchange={(e) => commit(e, goals, () => formatGoals(t.goals))} />
  <Input value={t.note ?? ""} placeholder="Note…" aria-label="Note" onchange={(e) => commit(e, (v) => setTaskNote(ui.data, t.id, v), () => t.note)} />
  <Switch checked={t.enabled} aria-label="Enabled" onCheckedChange={(on) => act(() => setTaskEnabled(ui.data, t.id, on))} />
  {#if t.triggers?.length}<div class="col-span-full flex flex-wrap items-center gap-1.5"><span class="text-xs font-semibold text-muted-foreground uppercase">Auto</span>
    {#each t.triggers ?? [] as tr, i}<Badge variant="secondary" class="gap-1 pr-0.5">{triggerLabel(tr, ui.data.arena.maps)}<Button variant="ghost" size="icon-xs" class="size-4" aria-label="Remove trigger" title="Remove"
      onclick={() => act(() => removeTrigger(ui.data, t.id, i))}><X /></Button></Badge>{/each}
    {#if offer.length}<NativeSelect size="sm" aria-label="Auto-tick when" onchange={(e) => { const tr = offer[+e.currentTarget.value]; e.currentTarget.value = ""; if (tr) act(() => addTrigger(ui.data, t.id, tr)); }}>
      <NativeSelectOption value="">Auto-tick when…</NativeSelectOption>{#each offer as tr, i}<NativeSelectOption value={i}>{triggerLabel(tr, ui.data.arena.maps)}</NativeSelectOption>{/each}</NativeSelect>{/if}</div>{/if}</div>
