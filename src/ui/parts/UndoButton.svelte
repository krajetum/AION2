<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { lastUndo } from "../../domain/undo.ts";
  import { undo } from "../actions.ts";
  import { ui } from "../state.svelte.ts";

  const e = $derived(lastUndo(ui.data, ui.charId));
</script>

<Button variant="ghost" size="sm" title={e ? "Ctrl+Z" : undefined} disabled={!e} onclick={undo}>{e ? `Undo: ${e.label}` : "Nothing to undo"}</Button>
