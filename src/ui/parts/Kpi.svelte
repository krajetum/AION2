<script lang="ts">
  // A number on a card with its label and a line under it; "hero" = the page's main number, in the accent.
  import type { Snippet } from "svelte";
  import * as Card from "$lib/components/ui/card/index.js";

  let { label, value, sub, cls = "", children }: { label: string; value: string; sub?: string; cls?: string; children?: Snippet } = $props();
</script>

<Card.Root class="gap-0.5 px-4 py-3">
  <div class="text-xs text-muted-foreground">{label}</div>
  <div class="font-semibold tabular-nums {cls === 'hero' ? 'text-3xl text-primary' : 'text-2xl'}">{value}</div>
  <div class="text-xs text-muted-foreground">{#if children}{@render children()}{:else}{sub}{/if}</div>
</Card.Root>
