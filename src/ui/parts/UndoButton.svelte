<script lang="ts">
  import { lastUndo } from "../../domain/undo.ts";
  import { undo } from "../actions.ts";
  import { ui } from "../state.svelte.ts";

  const e = $derived(lastUndo(ui.data, ui.charId));
</script>

<button class="ghost" title={e ? "Ctrl+Z" : undefined} disabled={!e} onclick={undo}>{e ? `Undo: ${e.label}` : "Nothing to undo"}</button>
