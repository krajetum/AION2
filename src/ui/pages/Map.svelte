<script lang="ts">
  // Map page: the bundled world map (src/assets/ncsoft/, © NCSOFT) or one the player imported (kept only
  // on this PC, infra/map-image.ts), with their hidden-cube spots and reference points. Close markers merge into a numbered one when zoomed out.
  // Your live position and live cubes come later, from the packet recording, if the traffic has them.
  import { addPoint, deletePoint, setPointGame, setPointGroup, setPointKind, setPointLabel } from "../../app/map.ts";
  import { clusters, fitAffine, fitError, fitView, GROUP_COLORS, toImage, zoomAt, type Cluster, type PointKind, type View } from "../../domain/map.ts";
  import { clearMapImage, loadMapImage, saveMapImage } from "../../infra/map-image.ts";
  import worldMap from "../../assets/ncsoft/world-map.webp";
  import { act, commit } from "../actions.ts";
  import { num } from "../format.ts";
  import { ICON } from "../icons.ts";
  import { ui } from "../state.svelte.ts";

  type Mode = "move" | PointKind;
  const MODES: [Mode, string][] = [["move", "Move"], ["cube", "Add cube"], ["ref", "Add reference"]];

  let url = $state(worldMap), custom = $state(false), error = $state("");
  let size = $state({ w: 0, h: 0 }); // natural image size
  let vw = $state(0), vh = $state(0);
  let view = $state<View>({ scale: 1, x: 0, y: 0 });
  let mode = $state<Mode>("move"), group = $state(0), selected = $state("");
  let box = $state<HTMLDivElement>(); // inside the {#if}: there only once a map is loaded

  const points = $derived(ui.data.map.points);
  const sel = $derived(points.find((p) => p.id === selected));
  const marks = $derived(size.w ? clusters(points, view, 22) : []);
  const refs = $derived(points.filter((p) => p.kind === "ref" && p.game).map((p) => ({ ...p, game: p.game! })));
  const fit = $derived(fitAffine(refs));
  const minScale = $derived(size.w && vw ? fitView(size.w, size.h, vw, vh).scale / 2 : 0.05);

  async function load() {
    try {
      const blob = await loadMapImage();
      if (custom) URL.revokeObjectURL(url);
      custom = !!blob;
      url = blob ? URL.createObjectURL(blob) : worldMap;
    } catch (e) { error = `Could not read the saved map: ${e}`; }
  }
  $effect(() => { load(); return () => { if (custom) URL.revokeObjectURL(url); }; });

  // Points are image pixels: on another image they land in other places.
  const moveOn = () => !points.length || confirm("Your points are placed on the current map image. On a different image they will be in the wrong places. Continue?");

  async function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement, file = input.files?.[0];
    input.value = "";
    if (!file || !moveOn()) return;
    error = "";
    try { await saveMapImage(file); await load(); } catch (err) { error = `Could not save the map: ${err}`; }
  }
  async function remove() {
    if (!moveOn()) return;
    await clearMapImage();
    await load();
  }

  const refit = () => { if (size.w && vw) view = fitView(size.w, size.h, vw, vh); };
  function loaded(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    size = { w: img.naturalWidth, h: img.naturalHeight };
    refit();
  }
  const zoom = (f: number, cx = vw / 2, cy = vh / 2) => { view = zoomAt(view, f, cx, cy, minScale, 4); };

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  $effect(() => {
    const el = box;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  });

  // Drag pans; a click without a drag adds a point (in an add mode) or clears the selection.
  let drag: { id: number; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null = null;
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    box?.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
  }
  function move(e: PointerEvent) {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    view = { ...view, x: drag.vx + dx, y: drag.vy + dy };
  }
  function up(e: PointerEvent) {
    if (!drag || drag.id !== e.pointerId) return;
    const click = !drag.moved;
    drag = null;
    if (!click) return;
    const r = box!.getBoundingClientRect(), p = toImage(view, e.clientX - r.left, e.clientY - r.top);
    if (mode === "move" || p.x < 0 || p.y < 0 || p.x > size.w || p.y > size.h) { selected = ""; return; }
    act(() => { selected = addPoint(ui.data, p.x, p.y, mode as PointKind, group).id; });
  }

  function open(c: Cluster) {
    if (c.points.length === 1) { selected = c.points[0].id; return; }
    zoom(2.5, c.x, c.y);
  }
  // A reference's game coordinates as typed: saved once both are numbers, cleared once both are empty.
  let gx = $state(""), gy = $state("");
  $effect(() => { gx = String(sel?.game?.x ?? ""); gy = String(sel?.game?.y ?? ""); });
  function setGame() {
    if (!sel) return;
    const both = gx.trim() && gy.trim(), none = !gx.trim() && !gy.trim();
    if (both || none) act(() => setPointGame(ui.data, sel.id, gx, gy));
  }
  const mixed = (c: Cluster) => new Set(c.points.map((p) => p.group)).size > 1;
</script>

<p class="hint dps-note">The world map with the hidden-cube spots you find (one color per spawn group) and reference points.
  You can import your own map image instead: it stays only on this PC. Your live position needs the packet recording first
  (Settings &gt; Diagnostics).</p>
{#if error}<p class="hint error">{error}</p>{/if}

<section class="map-page">
  <div class="map-tools">
    <div class="seg" role="group" aria-label="Click on the map to">{#each MODES as [m, label]}
      <button class:on={mode === m} aria-pressed={mode === m} onclick={() => { mode = m; }}>{label}</button>{/each}</div>
    <div class="swatches" role="group" aria-label="Spawn group for new cubes">{#each GROUP_COLORS as c, i}
      <button class="swatch" class:on={group === i} style:--c={c} aria-pressed={group === i} aria-label="Group {i + 1}" title="Group {i + 1}"
        onclick={() => { group = i; }}></button>{/each}</div>
    <span class="grow"></span>
    <button class="ghost" aria-label="Zoom out" title="Zoom out" onclick={() => zoom(1 / 1.5)}>−</button>
    <button class="ghost" aria-label="Zoom in" title="Zoom in" onclick={() => zoom(1.5)}>+</button>
    <button class="ghost" onclick={refit}>Fit</button>
  </div>

  <div class="map-view" class:adding={mode !== "move"} bind:this={box} bind:clientWidth={vw} bind:clientHeight={vh}
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={() => { drag = null; }} role="application" aria-label="Map">
    <img src={url} alt="" draggable="false" onload={loaded}
      style:transform="translate({view.x}px, {view.y}px) scale({view.scale})">
    {#each marks as c (c.points.map((p) => p.id).join())}{@const p = c.points[0]}
      <button class="mark" class:ref={c.points.length === 1 && p.kind === "ref"} class:cluster={c.points.length > 1} class:sel={c.points.some((q) => q.id === selected)}
        style:left="{c.x}px" style:top="{c.y}px" style:--c={mixed(c) ? "#e8e4dc" : GROUP_COLORS[p.group]}
        title={c.points.length > 1 ? `${c.points.length} points: click to zoom in` : p.label || (p.kind === "ref" ? "Reference" : `Cube, group ${p.group + 1}`)}
        onpointerdown={(e) => e.stopPropagation()} onclick={() => open(c)}>{c.points.length > 1 ? c.points.length : ""}</button>{/each}
    {#if sel}<div class="map-panel" role="dialog" aria-label="Point" tabindex="-1" onpointerdown={(e) => e.stopPropagation()}><h2>{sel.kind === "ref" ? "Reference" : "Cube spot"} <span class="count num">x {sel.x} · y {sel.y}</span>
        <button class="ghost" aria-label="Close" title="Close" onclick={() => { selected = ""; }}>{@html ICON.close}</button></h2>
      <div class="setting"><input value={sel.label} placeholder={sel.kind === "ref" ? "Place (e.g. an obelisk)" : "Note"} aria-label="Label" autocomplete="off"
        onchange={(e) => commit(e, (v) => setPointLabel(ui.data, sel.id, v), () => sel.label)}>
        <div class="seg" role="group" aria-label="Kind">
          <button class:on={sel.kind === "cube"} aria-pressed={sel.kind === "cube"} onclick={() => act(() => setPointKind(ui.data, sel.id, "cube"))}>Cube</button>
          <button class:on={sel.kind === "ref"} aria-pressed={sel.kind === "ref"} onclick={() => act(() => setPointKind(ui.data, sel.id, "ref"))}>Reference</button></div></div>
      {#if sel.kind === "cube"}<div class="swatches" role="group" aria-label="Spawn group">{#each GROUP_COLORS as c, i}
        <button class="swatch" class:on={sel.group === i} style:--c={c} aria-pressed={sel.group === i} aria-label="Group {i + 1}" title="Group {i + 1}"
          onclick={() => act(() => setPointGroup(ui.data, sel.id, i))}></button>{/each}</div>
      {:else}<div class="setting"><span>Game coordinates</span><span class="ctl">
        <input class="num" inputmode="decimal" placeholder="x" aria-label="Game x" bind:value={gx} onchange={setGame}>
        <input class="num" inputmode="decimal" placeholder="y" aria-label="Game y" bind:value={gy} onchange={setGame}></span></div>
        <p class="hint">Three or more references with game coordinates let the map place you (and anything else the game reports) on this image.
          They come from the packet recording; leave them empty until then.</p>{/if}
      <div class="btns"><button onclick={() => { const id = sel.id; selected = ""; act(() => deletePoint(ui.data, id)); }}>Delete point</button></div>
    </div>{/if}
  </div>

  <div class="map-foot">
    <span class="hint">{num(points.filter((p) => p.kind === "cube").length)} cube spots · {num(points.filter((p) => p.kind === "ref").length)} references
      {#if fit} · game → map fit off by up to {fitError(fit, refs).toFixed(0)} px{:else if refs.length} · {refs.length}/3 references with game coordinates for the fit{/if}</span>
    <span class="grow"></span>
    <label class="btn ghost">Import your own map <input type="file" accept="image/png,image/jpeg,image/webp" hidden onchange={pick}></label>
    {#if custom}<button class="ghost" onclick={remove}>Back to the bundled map</button>{/if}
  </div>
  {#if !custom}<p class="hint">Map: AION 2 © NCSOFT, from in-game screenshots (not covered by this app's license).</p>{/if}
</section>

