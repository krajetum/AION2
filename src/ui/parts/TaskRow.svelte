<script lang="ts">
  import { setCount, setDone, stepCount } from "../../app/progress.ts";
  import { odyleFor } from "../../domain/meter.ts";
  import { isDone } from "../../domain/tasks.ts";
  import type { Task } from "../../domain/types.ts";
  import { act, commit, track } from "../actions.ts";
  import { react } from "../overlays.ts";
  import { ui } from "../state.svelte.ts";

  let { t, hint = "" }: { t: Task; hint?: string } = $props();

  const p = $derived(ui.data.progress[ui.charId]?.[t.id]);
  const done = $derived(isDone(t, p));
  const count = (i: number) => p?.counts?.[i] ?? 0;
  // Odyle tasks: the energy the game last sent for this character (a hint, never a tick).
  const odyle = $derived(t.name.includes("Odyle Energy")
    ? odyleFor(ui.meter, ui.data.characters.find((c) => c.id === ui.charId)?.name) : undefined);

  function toggle(e: Event) {
    const checked = (e.currentTarget as HTMLInputElement).checked;
    act(() => {
      track(t.id, () => setDone(ui.data, ui.charId, t.id, checked));
      if (checked) react(ui.data.settings);
    });
  }
  const step = (i: number, dir: 1 | -1) => act(() => track(t.id, () => stepCount(ui.data, ui.charId, t.id, i, dir)));
</script>

<div class="task {done ? 'done' : ''}">
  <label><input type="checkbox" checked={done} onchange={toggle}>
    <span class="text"><span class="name">{t.name}</span>{#if t.note}<small>{t.note}</small>{/if}{#if hint}<small class="plan-hint">{hint}</small>{/if}{#if odyle}<small class="plan-hint">In game: {odyle.basic} basic · {odyle.charged} charged</small>{/if}</span></label>
  {#if t.goals?.length}<div class="goals">{#each t.goals as g, i}{@const v = count(i)}{@const name = g.label ?? t.name}<div class="goal {v >= g.target ? 'ok' : ''}">
      <div class="stepper">{#if g.label}<span class="of">{g.label}</span>{/if}
        <button aria-label="Decrease {name}" onclick={() => step(i, -1)}>−</button>
        <input type="number" inputmode="numeric" min="0" max={g.target} step={g.step ?? 1} value={v} aria-label={name}
          onchange={(e) => commit(e, (x) => track(t.id, () => setCount(ui.data, ui.charId, t.id, i, +x)), () => count(i))}>
        <span class="of">/ {g.target}</span>
        <button aria-label="Increase {name}" onclick={() => step(i, 1)}>+</button></div>
      <div class="bar"><i style="--p:{Math.min(1, v / g.target)}"></i></div></div>{/each}</div>{/if}</div>
