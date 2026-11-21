<script lang="ts">
  // A page's "How it works": folded, one line until opened.
  import type { Snippet } from "svelte";
  let { label = "How it works", children }: { label?: string; children: Snippet } = $props();
</script>

<details class="group mb-3">
  <summary class="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
    <span class="transition-transform group-open:rotate-90">›</span>{label}</summary>
  <div class="mt-1.5 max-w-[90ch] space-y-1.5 text-xs text-muted-foreground [&_p]:m-0">{@render children()}</div>
</details>
