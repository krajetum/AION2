<script lang="ts">
  // The hidden-cube popup (index.html#cube, shown by src-tauri/src/meter.rs while a known cube is in view
  // and for a few seconds after one is opened): the nearest cube's distance and direction from you, a chime
  // when a new one appears, green "Cube opened" after an opening. Settings > Overlays turns it on and sizes it.
  import { channelVolume } from "../domain/alerts.ts";
  import { bearing, climb, toMetres } from "../domain/map.ts";
  import type { MeterUpdate } from "../domain/meter.ts";
  import type { Settings } from "../domain/types.ts";
  import { loadCubePicture, type Opener } from "../infra/map-image.ts";
  import { onMeter, sizeOverlay } from "../infra/meter.ts";
  import { playSound } from "../infra/notifier.ts";
  import { loadData } from "../infra/storage.ts";

  const BASE_WIDTH = 260, BASE_HEIGHT = 96; // the window's size at scale 1 (src-tauri/src/meter.rs CUBE_SIZE)
  const PICTURE = { w: 240, h: 200 }; // the window while it shows the "cube opened" picture, at scale 1
  const OPENED_MS = 5_000;

  let u = $state<MeterUpdate | undefined>();
  let now = $state(Date.now());
  let width = $state(BASE_WIDTH);
  let settings: Settings | undefined;
  const heard = new Set<number>(); // cubes already chimed for

  // Sound settings from the save file (refreshed, so a volume change in the main window applies).
  let pictures = $state<Record<Opener, string>>({ you: "", other: "" });
  const reload = () => {
    loadData().then((d) => { settings = d.settings; }).catch(() => {});
    for (const who of ["you", "other"] as const) loadCubePicture(who).then((b) => {
      if (pictures[who]) URL.revokeObjectURL(pictures[who]);
      pictures[who] = b ? URL.createObjectURL(b) : "";
    }).catch(() => {});
  };
  // Sounds on the cube channel: a chime when one appears, a sad one when another player opens it.
  const play = (name: string) => { const vol = settings ? channelVolume(settings, "cube") : 70; if (vol) playSound([name, "cube"], vol); };
  // The newest opening already announced (-1 until the first update: what was opened before the
  // window opened is not announced).
  let lastHeard = -1;
  $effect(() => { reload(); const t = setInterval(reload, 30_000); return () => clearInterval(t); });
  $effect(() => { const t = setInterval(() => (now = Date.now()), 500); return () => clearInterval(t); });
  $effect(() => onMeter((x) => {
    u = x;
    for (const c of x.cubes?.live ?? []) {
      if (heard.has(c.entity)) continue;
      heard.add(c.entity);
      play("cube");
    }
    const o = x.cubes?.opened.at(-1);
    if (lastHeard < 0) lastHeard = o?.atMs ?? 0;
    else if (o && o.atMs > lastHeard) {
      if (lastHeard >= 0 && !o.byYou) play("cube-lost");
      lastHeard = o.atMs;
    }
  }));

  const live = $derived(u?.cubes?.live ?? []);
  const lastOpened = $derived(u?.cubes?.opened.at(-1));
  const opened = $derived(!live.length && !!lastOpened && now - lastOpened.atMs < OPENED_MS);
  const pos = $derived(u?.position ?? null);
  // With a picture, "cube opened" is the picture alone: the window grows for it, then shrinks back.
  const picture = $derived(lastOpened ? pictures[lastOpened.byYou ? "you" : "other"] : "");
  const showPicture = $derived(opened && !!picture);
  $effect(() => {
    const k = settings?.cubePopupSize ?? 1;
    if (showPicture) sizeOverlay(PICTURE.w * k, PICTURE.h * k);
    else sizeOverlay(BASE_WIDTH * k, BASE_HEIGHT * k);
  });
  // The arrow turns smoothly: the shortest way to the new direction (350° → 10° is +20°, not -340°),
  // eased by CSS, since positions come every few seconds.
  let turned = $state(0);
  $effect(() => {
    if (!near) return;
    const delta = ((near.b.deg - turned) % 360 + 540) % 360 - 180;
    turned += delta;
  });
  const near = $derived(pos && live.length
    ? live.map((c) => ({ c, b: bearing(pos, c), h: climb(pos, c) })).sort((a, b) => a.b.dist - b.b.dist)[0] : null);
</script>

<svelte:window bind:innerWidth={width} />
{#if showPicture}<div class="cube-picture" data-tauri-drag-region>
  <img src={picture} alt="Cube opened" draggable="false" data-tauri-drag-region>
  <b class:lost={!lastOpened?.byYou} data-tauri-drag-region>{lastOpened?.byYou ? "Cube opened" : "Someone else opened it"}</b>
</div>
{:else}<div class="cube-pop" class:opened class:lost={opened && !lastOpened?.byYou} style:zoom={width / BASE_WIDTH} data-tauri-drag-region>
  {#if opened}<span class="cube-arrow" aria-hidden="true">{lastOpened?.byYou ? "✓" : "✗"}</span>
  {:else if near}<span class="cube-arrow" aria-hidden="true"><i style:--deg="{turned}deg">↑</i></span>{/if}
  <div data-tauri-drag-region>
    {#if opened}<b data-tauri-drag-region>Cube opened</b>
      <span data-tauri-drag-region>{lastOpened?.byYou ? "By you" : "By another player"}</span>
    {:else}<b data-tauri-drag-region>{live.length > 1 ? `${live.length} hidden cubes nearby` : "Hidden cube nearby"}</b>
      <span data-tauri-drag-region>{#if near}≈ {Math.round(toMetres(near.b.dist))} m {near.b.dir}{#if near.h.way !== "level"}{" "}· <em class="climb">{near.h.way === "up" ? "↑" : "↓"} {Math.round(toMetres(Math.abs(near.h.dz)))} m {near.h.way}</em>{/if}{:else}Position not known yet{/if}</span>{/if}
  </div>
</div>
{/if}
