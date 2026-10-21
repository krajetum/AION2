<script lang="ts">
  import type { Snippet } from "svelte";

  let { label, value, sub, cls = "", children }: { label: string; value: string; sub?: string; cls?: string; children?: Snippet } = $props();
</script>

<div class="kpi {cls}"><small>{label}</small><b>{value}</b><span>{#if children}{@render children()}{:else}{sub}{/if}</span></div>
