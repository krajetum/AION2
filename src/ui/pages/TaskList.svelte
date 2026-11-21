<script lang="ts">
  import { resetCadence } from "../../app/progress.ts";
  import { addTask, sortedTasks } from "../../app/tasks.ts";
  import { isDone } from "../../domain/tasks.ts";
  import type { Cadence } from "../../domain/types.ts";
  import { act } from "../actions.ts";
  import { LABEL } from "../format.ts";
  import { showStatus } from "../overlays.ts";
  import EditRow from "../parts/EditRow.svelte";
  import Empty from "../parts/Empty.svelte";
  import TaskRow from "../parts/TaskRow.svelte";
  import UndoButton from "../parts/UndoButton.svelte";
  import { ui } from "../state.svelte.ts";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import Panel from "$lib/components/app/Panel.svelte";

  let { cad }: { cad: Cadence } = $props();

  const prog = $derived(ui.data.progress[ui.charId]);
  const tasks = $derived(sortedTasks(ui.data, cad).filter((t) => ui.editing || t.enabled));
  const cats = $derived([...new Set(tasks.map((t) => t.category))]);
  const all = $derived(sortedTasks(ui.data, cad).filter((t) => t.enabled));
  const win = $derived(!ui.editing && all.length > 0 && all.every((t) => isDone(t, prog?.[t.id])));
  const touched = $derived(all.some((t) => prog?.[t.id]));

  let newCat = $state<HTMLInputElement | null>(null), newName = $state<HTMLInputElement | null>(null), newGoals = $state<HTMLInputElement | null>(null);
  function add() {
    const name = newName!.value.trim();
    if (!name) return;
    try { addTask(ui.data, cad, name, newCat!.value, newGoals!.value); } catch (err) { return showStatus((err as Error).message, true); }
    newCat!.value = newName!.value = newGoals!.value = "";
    act(() => {});
  }
  function reset() {
    act(() => {
      if (!resetCadence(ui.data, ui.charId, cad, `Reset ${LABEL[cad]}`, Date.now())) return false;
      showStatus(`${LABEL[cad]} reset. Ctrl+Z to undo.`);
    });
  }
</script>

<div class="mb-3 flex flex-wrap items-center justify-end gap-2">{#if !ui.editing}<UndoButton />
    <Button variant="ghost" size="sm" disabled={!touched} title="Clears {LABEL[cad].toLowerCase()} progress for this character. Undoable." onclick={reset}>Reset {LABEL[cad]}</Button>{/if}
  <Button variant={ui.editing ? "default" : "outline"} size="sm" onclick={() => act(() => { ui.editing = !ui.editing; })}>{ui.editing ? "Done" : "Edit tasks"}</Button></div>
{#if cats.length > 1}<div class="sticky top-14 z-10 mb-3 flex flex-wrap gap-1 rounded-lg border bg-muted p-0.5 shadow-[0_0_0_4px_var(--background)]" role="group" aria-label="Jump to a category">
  {#each cats as c (c)}<Button variant="ghost" size="sm" onclick={() => document.getElementById("cat-" + c)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{c}</Button>{/each}</div>{/if}
{#if win}<Card.Root class="mb-3 border-hps/30 bg-hps/10 px-4 py-3"><div><h2 class="m-0 text-base font-semibold text-hps">All {LABEL[cad].toLowerCase()} tasks done</h2><p class="m-0 text-sm text-muted-foreground">See you after the reset.</p></div></Card.Root>{/if}
{#each cats as cat (cat)}{@const list = tasks.filter((t) => t.category === cat)}<Panel id="cat-{cat}" title={cat} count={ui.editing ? "" : `${list.filter((t) => isDone(t, prog?.[t.id])).length}/${list.length}`} class="scroll-mt-28">
    {#each list as t (t.id)}{#if ui.editing}<EditRow {t} />{:else}<TaskRow {t} />{/if}{/each}
  </Panel>{:else}<Empty>No {LABEL[cad].toLowerCase()} tasks yet.
    {#snippet action()}{#if !ui.editing}<Button onclick={() => { ui.editing = true; }}>Add a task</Button>{/if}{/snippet}</Empty>{/each}
{#if ui.editing}<Panel title="New {LABEL[cad].toLowerCase()} task" class="border-dashed bg-transparent">
    <div class="flex flex-wrap gap-2">
      <Input id="new-cat" class="flex-[1_1_160px]" placeholder="Category…" list="cats" aria-label="Category" autocomplete="off" bind:ref={newCat} />
      <datalist id="cats">{#each cats as c}<option value={c}></option>{/each}</datalist>
      <Input id="new-name" class="flex-[1_1_160px]" placeholder="Name…" aria-label="Name" autocomplete="off" bind:ref={newName} />
      <Input id="new-goals" class="flex-[1_1_160px]" placeholder="Goals, e.g. Wins:30, Entries:10…" aria-label="Goals" autocomplete="off" bind:ref={newGoals} />
      <Button onclick={add}>Add task</Button>
    </div>
  </Panel>{/if}
