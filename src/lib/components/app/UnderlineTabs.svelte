<script lang="ts" generics="T extends string">
  // Tabs as a row of words with the current one underlined (the fight views, a page's sections).
  let { items, value, onchange, label }: { items: readonly (readonly [T, string])[]; value: T; onchange: (v: T) => void; label: string } = $props();
</script>

<div role="tablist" aria-label={label} class="flex gap-1 overflow-x-auto border-b">
  {#each items as [id, text]}<button type="button" role="tab" data-slot="tab" aria-selected={value === id} onclick={() => onchange(id)}
      class="-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors {value === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}">{text}</button>{/each}
</div>
