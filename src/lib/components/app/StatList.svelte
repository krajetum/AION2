<script lang="ts">
  // Stat name → value rows in columns, as the game's stat pages list them. `cls` per row = the name's colour class.
  let { rows }: { rows: { key: string | number; name: string; value: string; cls?: string }[] } = $props();
</script>

<dl class="m-0 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 text-sm">
  {#each rows as r (r.key)}<div class="flex justify-between gap-2 border-b py-1"><dt class={r.cls ?? "text-muted-foreground"}>{r.name}</dt><dd class="m-0 tabular-nums">{r.value}</dd></div>{/each}
</dl>
