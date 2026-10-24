<script lang="ts">
  // The radar (index.html#radar, shown by src-tauri/src/meter.rs while on in Settings > Overlays): the
  // cubes around you, north up, centred on you, to lay over the game's minimap. Found cubes (purple),
  // cubes in view now (shining), the map under it if wanted. A normal always-on-top window: it never
  // touches the game's own minimap. Drag it into place and size it by its edges.
  import worldMap from "../assets/ncsoft/world-map.webp";
  import { applyAffine, BUNDLED_FIT, fitAffine, onRadar, WORLD_MAP_ID, type Affine, type FoundCube } from "../domain/map.ts";
  import type { MeterUpdate } from "../domain/meter.ts";
  import type { Settings } from "../domain/types.ts";
  import { loadMapImage } from "../infra/map-image.ts";
  import { onMeter } from "../infra/meter.ts";
  import { loadData } from "../infra/storage.ts";

  let u = $state<MeterUpdate | undefined>();
  $effect(() => onMeter((x) => { u = x; }));
  let w = $state(220), h = $state(220);

  // From the save file (refreshed): settings, cubes found, the map and its fit.
  let settings = $state<Settings | undefined>(), found = $state<FoundCube[]>([]);
  let image = $state(worldMap), fit = $state<Affine | null>(BUNDLED_FIT), custom = $state(false);
  // Settings and cubes every 3 s (so a change in Settings shows at once), the map image every 30 s.
  let refs: Parameters<typeof fitAffine>[0] = [];
  async function reload() {
    try {
      const d = await loadData();
      settings = d.settings;
      found = d.map.found;
      refs = d.map.points.filter((p) => p.kind === "ref" && p.game).map((p) => ({ ...p, game: p.game! }));
      fit = fitAffine(refs) ?? (custom ? null : BUNDLED_FIT);
    } catch { /* keep what is shown */ }
  }
  async function reloadImage() {
    const blob = await loadMapImage().catch(() => undefined);
    if (custom) URL.revokeObjectURL(image);
    custom = !!blob;
    image = blob ? URL.createObjectURL(blob) : worldMap;
    fit = fitAffine(refs) ?? (custom ? null : BUNDLED_FIT);
  }
  $effect(() => {
    reload(); reloadImage();
    const a = setInterval(reload, 3_000), b = setInterval(reloadImage, 30_000);
    return () => { clearInterval(a); clearInterval(b); };
  });

  const pos = $derived(u?.position ?? null);
  const elsewhere = $derived(!!pos && !custom && pos.mapId != null && pos.mapId !== WORLD_MAP_ID);
  const r = $derived(Math.min(w, h) / 2 - 4);
  const range = $derived((settings?.radarRange ?? 100) * 100); // metres → game units (cm)
  const dots = $derived.by(() => {
    if (!pos || elsewhere) return [];
    const seen = [...found, ...(u?.cubes?.opened ?? [])];
    return [
      ...seen.map((c) => ({ at: onRadar(pos, c, range, r), live: false })),
      ...(u?.cubes?.live ?? []).map((c) => ({ at: onRadar(pos, c, range, r), live: true })),
    ].filter((d) => d.at);
  });
  // The map under the radar: image pixels scaled to the radar's units, you at the centre.
  const backdrop = $derived.by(() => {
    if (!pos || !fit || elsewhere || settings?.radarMap === false) return null;
    const k = r / range, you = applyAffine(fit, pos.x, pos.y);
    const sx = k / fit[0], sy = k / fit[4];
    return `translate(${w / 2 - you.x * sx}px, ${h / 2 - you.y * sy}px) scale(${sx}, ${sy})`;
  });
</script>

<svelte:window bind:innerWidth={w} bind:innerHeight={h} />
<div class="radar" class:round={settings?.radarRound !== false} data-tauri-drag-region>
  {#if backdrop}<img class="radar-map" src={image} alt="" draggable="false" style:transform={backdrop}>{/if}
  <span class="radar-n" data-tauri-drag-region>N</span>
  {#each dots as d}<i class="radar-cube" class:live={d.live} style:left="{w / 2 + d.at!.x}px" style:top="{h / 2 + d.at!.y}px"></i>{/each}
  <i class="radar-you"></i>
  {#if !pos}<small class="radar-note" data-tauri-drag-region>Waiting for your position</small>
  {:else if elsewhere}<small class="radar-note" data-tauri-drag-region>Another map</small>{/if}
</div>
