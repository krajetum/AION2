<script lang="ts">
  import { resetCadence } from "../../app/progress.ts";
  import { addTask, sortedTasks } from "../../app/tasks.ts";
  import { isDone } from "../../domain/tasks.ts";
  import type { Cadence } from "../../domain/types.ts";
  import { act } from "../actions.ts";
  import { LABEL } from "../format.ts";
  import { showStatus } from "../overlays.ts";
  import EditRow from "../parts/EditRow.svelte";
  import TaskRow from "../parts/TaskRow.svelte";
  import UndoButton from "../parts/UndoButton.svelte";
  import { ui } from "../state.svelte.ts";

  let { cad }: { cad: Cadence } = $props();

  const prog = $derived(ui.data.progress[ui.charId]);
  const tasks = $derived(sortedTasks(ui.data, cad).filter((t) => ui.editing || t.enabled));
  const cats = $derived([...new Set(tasks.map((t) => t.category))]);
  const all = $derived(sortedTasks(ui.data, cad).filter((t) => t.enabled));
  const win = $derived(!ui.editing && all.length > 0 && all.every((t) => isDone(t, prog?.[t.id])));
  const touched = $derived(all.some((t) => prog?.[t.id]));

  let newCat = $state<HTMLInputElement>(), newName = $state<HTMLInputElement>(), newGoals = $state<HTMLInputElement>();
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

<div class="toolbar">{#if !ui.editing}<UndoButton />
    <button class="ghost" disabled={!touched} title="Clears {LABEL[cad].toLowerCase()} progress for this character. Undoable." onclick={reset}>Reset {LABEL[cad]}</button>{/if}
  <button class={ui.editing ? "primary" : ""} onclick={() => act(() => { ui.editing = !ui.editing; })}>{ui.editing ? "Done" : "Edit tasks"}</button></div>
{#if win}<section class="win"><div><h2>All {LABEL[cad].toLowerCase()} tasks done</h2><p>See you after the reset.</p></div></section>{/if}
{#each cats as cat (cat)}{@const list = tasks.filter((t) => t.category === cat)}<section id="cat-{cat}"><h2>{cat}{#if !ui.editing}{" "}<span class="count">{list.filter((t) => isDone(t, prog?.[t.id])).length}/{list.length}</span>{/if}</h2>
    {#each list as t (t.id)}{#if ui.editing}<EditRow {t} />{:else}<TaskRow {t} />{/if}{/each}
  </section>{:else}<p class="empty">No tasks yet. Click <b>Edit tasks</b> to add one.</p>{/each}
{#if ui.editing}<section class="add"><h2>New {LABEL[cad].toLowerCase()} task</h2>
    <div class="row">
      <input id="new-cat" placeholder="Category…" list="cats" aria-label="Category" autocomplete="off" bind:this={newCat}>
      <datalist id="cats">{#each cats as c}<option value={c}></option>{/each}</datalist>
      <input id="new-name" placeholder="Name…" aria-label="Name" autocomplete="off" bind:this={newName}>
      <input id="new-goals" placeholder="Goals, e.g. Wins:30, Entries:10…" aria-label="Goals" autocomplete="off" bind:this={newGoals}>
      <button class="primary" onclick={add}>Add task</button>
    </div>
  </section>{/if}
