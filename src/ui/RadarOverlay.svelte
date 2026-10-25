<script lang="ts">
  // The radar (index.html#radar, shown by src-tauri/src/meter.rs while on in Settings > Overlays): the
  // cubes around you, north up, centred on you, to lay over the game's minimap. Found cubes of the map you are on (purple),
  // cubes in view now (shining), the map under it if wanted. A normal always-on-top window: it never
  // touches the game's own minimap. Drag it into place and size it by its edges.
  import { applyAffine, mapOf, onRadar, WORLD_MAP_ID, type Affine, type FoundCube, type MapKey, type MapPoint } from "../domain/map.ts";
  import type { MeterUpdate } from "../domain/meter.ts";
  import type { Settings } from "../domain/types.ts";
  import { loadMapImage } from "../infra/map-image.ts";
  import { onMeter } from "../infra/meter.ts";
  import { loadData } from "../infra/storage.ts";
  import { BUNDLED_IMAGE, fitFor } from "./maps.ts";

  let u = $state<MeterUpdate | undefined>();
  $effect(() => onMeter((x) => { u = x; }));
  let w = $state(220), h = $state(220);

  // From the save file (refreshed): settings, cubes found, the points (for the fit).
  let settings = $state<Settings | undefined>(), found = $state<FoundCube[]>([]), points = $state<MapPoint[]>([]);
  // The page map you are on (before any map load says, the world map), its image and whether it is imported.
  const pos = $derived(u?.position ?? null);
  // Unknown until a map load or the game's map (M) names it (position.rs): no map is guessed.
  const key = $derived<MapKey | null>(pos?.mapId == null ? null : mapOf(pos.mapId));
  let image = $state<string | null>(null), custom = $state(false), imageOf: MapKey | null = null;
  const fit = $derived<Affine | null>(key ? fitFor(points, key, custom) : null);
  // Settings and cubes every 3 s (so a change in Settings shows at once), the map image every 30 s and on a map change.
  async function reload() {
    try {
      const d = await loadData();
      settings = d.settings;
      found = d.map.found;
      points = d.map.points;
    } catch { /* keep what is shown */ }
  }
  async function reloadImage(k: MapKey | null) {
    const blob = k ? await loadMapImage(k).catch(() => undefined) : undefined;
    if (custom && image) URL.revokeObjectURL(image);
    custom = !!blob;
    image = blob ? URL.createObjectURL(blob) : k ? BUNDLED_IMAGE[k] : null;
    imageOf = k;
  }
  $effect(() => {
    reload();
    const a = setInterval(reload, 3_000), b = setInterval(() => reloadImage(imageOf), 30_000);
    return () => { clearInterval(a); clearInterval(b); };
  });
  $effect(() => { reloadImage(key); });

  // Found cubes on the map you are on (cubes saved before map ids were kept: the world map); none while it is unknown.
  const here = (c: FoundCube) => pos?.mapId != null && (c.mapId != null ? c.mapId === pos.mapId : pos.mapId === WORLD_MAP_ID);
  const elsewhere = $derived(!!pos && !key);
  const r = $derived(Math.min(w, h) / 2 - 4);
  const range = $derived((settings?.radarRange ?? 100) * 100); // metres → game units (cm)
  const dots = $derived.by(() => {
    if (!pos) return [];
    const seen = [...found.filter(here), ...(u?.cubes?.opened ?? [])];
    return [
      ...seen.map((c) => ({ at: onRadar(pos, c, range, r), live: false })),
      ...(u?.cubes?.live ?? []).map((c) => ({ at: onRadar(pos, c, range, r), live: true })),
    ].filter((d) => d.at);
  });
  // The map under the radar: image pixels scaled to the radar's units, you at the centre.
  const backdrop = $derived.by(() => {
    if (!pos || !fit || !image || elsewhere || settings?.radarMap === false) return null;
    const k = r / range, you = applyAffine(fit, pos.x, pos.y);
    const sx = k / fit[0], sy = k / fit[4];
    return `translate(${w / 2 - you.x * sx}px, ${h / 2 - you.y * sy}px) scale(${sx}, ${sy})`;
  });
</script>

<svelte:window bind:innerWidth={w} bind:innerHeight={h} />
<div class="radar" class:round={settings?.radarRound !== false} data-tauri-drag-region>
  {#if backdrop && image}<img class="radar-map" src={image} alt="" draggable="false" style:transform={backdrop}>{/if}
  <span class="radar-n" data-tauri-drag-region>N</span>
  {#each dots as d}<i class="radar-cube" class:live={d.live} style:left="{w / 2 + d.at!.x}px" style:top="{h / 2 + d.at!.y}px"></i>{/each}
  <i class="radar-you"></i>
  {#if !pos}<small class="radar-note" data-tauri-drag-region>Waiting for your position</small>
  {:else if pos.mapId == null && !dots.length}<small class="radar-note" data-tauri-drag-region>Open the game's map (M) once</small>
  {:else if elsewhere && !dots.length}<small class="radar-note" data-tauri-drag-region>Another map</small>{/if}
</div>
