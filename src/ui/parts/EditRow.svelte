<script lang="ts">
  import { moveTask, renameTask, setTaskCategory, setTaskEnabled, setTaskGoals, setTaskNote } from "../../app/tasks.ts";
  import { formatGoals } from "../../domain/tasks.ts";
  import type { Task } from "../../domain/types.ts";
  import { act, commit } from "../actions.ts";
  import { showStatus } from "../overlays.ts";
  import { ui } from "../state.svelte.ts";

  let { t }: { t: Task } = $props();

  function goals(v: string) {
    try { setTaskGoals(ui.data, t.id, v); } catch (err) { showStatus((err as Error).message, true); }
  }
</script>

<div class="task edit {t.enabled ? '' : 'off'}">
  <span class="move"><button aria-label="Move up" title="Move up" onclick={() => act(() => moveTask(ui.data, t.id, -1))}>▲</button><button aria-label="Move down" title="Move down" onclick={() => act(() => moveTask(ui.data, t.id, 1))}>▼</button></span>
  <input value={t.category} aria-label="Category" title="Category" onchange={(e) => commit(e, (v) => setTaskCategory(ui.data, t.id, v), () => t.category)}>
  <input value={t.name} aria-label="Name" title="Name" onchange={(e) => commit(e, (v) => renameTask(ui.data, t.id, v), () => t.name)}>
  <input value={formatGoals(t.goals)} placeholder="Goals…" aria-label="Goals" title="E.g. 2000 · Wins:30, Entries:10 · Level:50/5"
    onchange={(e) => commit(e, goals, () => formatGoals(t.goals))}>
  <input value={t.note ?? ""} placeholder="Note…" aria-label="Note" onchange={(e) => commit(e, (v) => setTaskNote(ui.data, t.id, v), () => t.note)}>
  <label class="switch"><input type="checkbox" checked={t.enabled} aria-label="Enabled"
    onchange={(e) => act(() => setTaskEnabled(ui.data, t.id, e.currentTarget.checked))}></label></div>
