<script lang="ts">
  import { triggerLabel } from "../../domain/triggers.ts";
  import { setCount, setDone, stepCount } from "../../app/progress.ts";
  import { odyleFor } from "../../domain/meter.ts";
  import { isDone } from "../../domain/tasks.ts";
  import type { Task } from "../../domain/types.ts";
  import { act, commit, track } from "../actions.ts";
  import { react } from "../overlays.ts";
  import { ui } from "../state.svelte.ts";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";

  let { t, hint = "" }: { t: Task; hint?: string } = $props();

  const p = $derived(ui.data.progress[ui.charId]?.[t.id]);
  const done = $derived(isDone(t, p));
  const count = (i: number) => p?.counts?.[i] ?? 0;
  // Odyle tasks: the energy the game last sent for this character (a hint, never a tick).
  const odyle = $derived(t.name.includes("Odyle Energy")
    ? odyleFor(ui.meter, ui.data.characters.find((c) => c.id === ui.charId)?.name) : undefined);

  let box = $state<HTMLButtonElement | null>(null);
  function toggle(checked: boolean) {
    // A tick lands: the box pops once (with the sound of the "Task checked" channel).
    if (checked && box && !matchMedia("(prefers-reduced-motion: reduce)").matches) box.animate([{ transform: "scale(1)" }, { transform: "scale(1.3)" }, { transform: "scale(1)" }], 220);
    act(() => {
      track(t.id, () => setDone(ui.data, ui.charId, t.id, checked));
      if (checked) react(ui.data.settings);
    });
  }
  const step = (i: number, dir: 1 | -1) => act(() => track(t.id, () => stepCount(ui.data, ui.charId, t.id, i, dir)));
</script>

<div class="flex flex-wrap items-center gap-3 border-b py-2.5 last:border-0">
  <label class="flex min-w-0 flex-[1_1_240px] cursor-pointer items-center gap-3">
    <Checkbox bind:ref={box} checked={done} onCheckedChange={toggle} />
    <span class="flex min-w-0 flex-col"><span class="font-medium break-words transition-colors {done ? 'text-hps' : ''}">{t.name}{#if done}<Badge variant="secondary" class="ml-2 text-hps">Done</Badge>{/if}</span>
      {#if t.note}<small class="text-xs text-muted-foreground">{t.note}</small>{/if}{#if t.triggers?.length}<small class="text-xs text-muted-foreground">Auto: {t.triggers.map((x) => triggerLabel(x, ui.data.arena.maps)).join(" · ")}</small>{/if}{#if hint}<small class="text-xs text-muted-foreground">{hint}</small>{/if}{#if odyle}<small class="text-xs text-muted-foreground">In game: {odyle.basic} basic · {odyle.charged} charged</small>{/if}</span></label>
  {#if t.goals?.length}<div class="flex flex-wrap gap-3">{#each t.goals as g, i}{@const v = count(i)}{@const name = g.label ?? t.name}<div class="flex flex-col gap-1.5 text-xs {v >= g.target ? 'text-hps' : 'text-muted-foreground'}">
      <div class="inline-flex h-8 items-center rounded-md border bg-secondary">{#if g.label}<span class="pl-2.5 pr-1">{g.label}</span>{/if}
        <Button variant="ghost" size="icon-sm" aria-label="Decrease {name}" onclick={() => step(i, -1)}>−</Button>
        <input data-slot="stepper-input" class="h-full w-12 bg-transparent text-right text-sm text-foreground tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          type="number" inputmode="numeric" min="0" max={g.target} step={g.step ?? 1} value={v} aria-label={name}
          onchange={(e) => commit(e, (x) => track(t.id, () => setCount(ui.data, ui.charId, t.id, i, +x)), () => count(i))}>
        <span class="pr-1 pl-1 tabular-nums">/ {g.target}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Increase {name}" onclick={() => step(i, 1)}>+</Button></div>
      <Progress value={Math.min(100, (v / g.target) * 100)} class="h-1 {v >= g.target ? '[&>[data-slot=progress-indicator]]:bg-hps' : ''}" /></div>{/each}</div>{/if}</div>
