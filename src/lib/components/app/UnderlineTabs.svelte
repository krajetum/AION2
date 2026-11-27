<script lang="ts" generics="T extends string">
  // Tabs as a row of words with the current one underlined (the fight views, a page's sections); each may carry an icon
  // and a count badge. Scrolls sideways when narrower than the row.
  import type { Component } from "svelte";
  let { items, value, onchange, label }: { items: readonly (readonly [T, string, Component?, (string | number)?])[]; value: T; onchange: (v: T) => void; label: string } = $props();
</script>

<div role="tablist" aria-label={label} class="flex gap-1 overflow-x-auto overflow-y-hidden border-b">
  {#each items as [id, text, Icon, badge]}<button type="button" role="tab" data-slot="tab" aria-selected={value === id} onclick={() => onchange(id)}
      class="inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors {value === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}">
      {#if Icon}<Icon class="size-4" />{/if}{text}{#if badge != null && badge !== ""}<span class="rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary tabular-nums">{badge}</span>{/if}</button>{/each}
</div>
