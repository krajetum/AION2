<script lang="ts">
  // A sparkline: the shape of a few numbers, oldest first, no axes (the Wallet's Kina and Abyss Points per day).
  let { values, label }: { values: number[]; label: string } = $props();
  const W = 56, H = 16;
  const points = $derived.by(() => {
    const min = Math.min(...values), span = Math.max(...values) - min || 1;
    return values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - 1 - ((v - min) / span) * (H - 2)).toFixed(1)}`).join(" ");
  });
</script>

{#if values.length > 1 && values.some((v) => v !== values[0])}<svg class="spark" viewBox="0 0 {W} {H}" width={W} height={H} role="img" aria-label={label}>
  <title>{label}</title><polyline {points} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>{/if}

<style>
  .spark { flex: none; align-self: center; color: var(--gold); }
</style>
