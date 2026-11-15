<script lang="ts">
  // An empty page or list: the mascot standing by (your class's once the game said who you play), why it is empty,
  // and the button that fills it when there is one.
  import type { Snippet } from "svelte";
  import { sheetFor } from "../../domain/mascot.ts";
  import { ui } from "../state.svelte.ts";

  let { children, action }: { children: Snippet; action?: Snippet } = $props();
  const p = $derived(ui.meter?.profile);
  const sheet = $derived((p && sheetFor(p.job, ui.data.settings.mascotGender, p.serverId)) || "gladiator-m-elyos");
</script>

<div class="empty">
  {#if ui.data.settings.mascot}<i class="empty-mascot" style:background-image="url(/mascots/{sheet}.png)" aria-hidden="true"></i>{/if}
  <p>{@render children()}</p>
  {#if action}{@render action()}{/if}
</div>

<style>
  /* The sheet's first frame (idle), at its own 48 px. */
  .empty-mascot { width: 48px; height: 48px; background-repeat: no-repeat; image-rendering: pixelated; opacity: .85; }
  p { margin: 0; }
</style>
