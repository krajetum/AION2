<script lang="ts">
  // The hidden-cube popup (index.html#cube, shown by src-tauri/src/meter.rs while a known cube is in view):
  // the nearest cube's distance and direction from you. Turn it off in Settings > Overlays.
  import { bearing, toMetres } from "../domain/map.ts";
  import type { MeterUpdate } from "../domain/meter.ts";
  import { onMeter } from "../infra/meter.ts";

  let u = $state<MeterUpdate | undefined>();
  $effect(() => onMeter((x) => { u = x; }));

  const live = $derived(u?.cubes?.live ?? []);
  const pos = $derived(u?.position ?? null);
  const near = $derived(pos && live.length
    ? live.map((c) => ({ c, b: bearing(pos, c) })).sort((a, b) => a.b.dist - b.b.dist)[0] : null);
</script>

<div class="cube-pop" data-tauri-drag-region>
  {#if near}<span class="cube-arrow" style:--deg="{near.b.deg}deg" aria-hidden="true">↑</span>{/if}
  <div data-tauri-drag-region>
    <b data-tauri-drag-region>{live.length > 1 ? `${live.length} hidden cubes nearby` : "Hidden cube nearby"}</b>
    <span data-tauri-drag-region>{#if near}≈ {Math.round(toMetres(near.b.dist))} m {near.b.dir}{:else}Position not known yet{/if}</span>
  </div>
</div>
