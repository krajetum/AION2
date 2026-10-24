<script lang="ts">
  import { untrack } from "svelte";
  // Map page: the bundled world map (src/assets/ncsoft/, © NCSOFT) or one the player imported (kept only
  // on this PC, infra/map-image.ts), with their hidden-cube spots and reference points. Close markers merge into a numbered one when zoomed out.
  // You are drawn from the meter's position (src-tauri/meter/src/position.rs) through the game → pixel fit:
  // the bundled map's own (BUNDLED_FIT), or the player's references (3+ with game coordinates).
  import { addPoint, deletePoint, setPointGame, setPointGroup, setPointKind, setPointLabel } from "../../app/map.ts";
  import { applyAffine, BUNDLED_FIT, clusters, fitAffine, fitError, fitView, GROUP_COLORS, toImage, toScreen, WORLD_MAP_ID, zoomAt, type Cluster, type PointKind, type View } from "../../domain/map.ts";
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
  const ownFit = $derived(fitAffine(refs));
  const fit = $derived(ownFit ?? (custom ? null : BUNDLED_FIT));

  // You: on the bundled map only while on its world (or before any map load said where you are).
  const pos = $derived(ui.meter?.position ?? null);
  const elsewhere = $derived(!!pos && !custom && !ownFit && pos.mapId != null && pos.mapId !== WORLD_MAP_ID);
  const youPx = $derived(fit && pos && !elsewhere ? applyAffine(fit, pos.x, pos.y) : null);
  const you = $derived(youPx && size.w ? toScreen(view, youPx.x, youPx.y) : null);
  const age = $derived(pos ? Math.max(0, Math.round((ui.now - pos.atMs) / 1000)) : 0);
  const ago = (s: number) => (s < 60 ? `${s} s ago` : `${Math.floor(s / 60)} min ago`);
  // Hidden cubes from the meter: opened ones (saved, game units) and the ones in view now.
  function shown(x: number, y: number) {
    if (!fit || elsewhere) return null;
    const p = applyAffine(fit, x, y);
    return toScreen(view, p.x, p.y);
  }
  const found = $derived(size.w ? ui.data.map.found.map((f) => ({ f, s: shown(f.x, f.y) })).filter((v) => v.s) : []);
  const live = $derived(size.w ? (ui.meter?.cubes?.live ?? []).map((c) => ({ c, s: shown(c.x, c.y) })).filter((v) => v.s) : []);
  const when = (t: number) => new Date(t).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  // Follow me: the view stays centred on you (on by default; dragging the map turns it off).
  let follow = $state(true), zoomedIn = false;
  function centerOnMe() {
    if (!youPx) return;
    const scale = zoomedIn ? view.scale : Math.max(view.scale, 1); // close up the first time only
    zoomedIn = true;
    view = { scale, x: vw / 2 - youPx.x * scale, y: vh / 2 - youPx.y * scale };
  }
  // Re-centres when you move (or the map or window size changes), not when the view itself does.
  $effect(() => { if (follow && youPx && size.w && vw && vh) untrack(centerOnMe); });
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
  // While following, zoom stays centred on you.
  const zoom = (f: number, cx = vw / 2, cy = vh / 2) => {
    const [x, y] = follow && youPx ? [vw / 2, vh / 2] : [cx, cy];
    view = zoomAt(view, f, x, y, minScale, 4);
  };

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
    follow = false;
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
  You can import your own map image instead: it stays only on this PC. The gold dot is you: the game says where you are on
  teleports and whenever a buff or skill of yours lands, so it follows you with a few seconds' lag (desktop app with the meter running).</p>
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
    {#if youPx}<button class="ghost" class:on={follow} aria-pressed={follow} title="Keep the map centred on you (dragging the map stops it)"
      onclick={() => { follow = !follow; if (follow) centerOnMe(); }}>{follow ? "Following you" : "Follow me"}</button>{/if}
  </div>

  <div class="map-view" class:adding={mode !== "move"} class:gliding={follow && !!youPx} bind:this={box} bind:clientWidth={vw} bind:clientHeight={vh}
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={() => { drag = null; }} role="application" aria-label="Map">
    <img src={url} alt="" draggable="false" onload={loaded}
      style:transform="translate({view.x}px, {view.y}px) scale({view.scale})">
    {#each marks as c (c.points.map((p) => p.id).join())}{@const p = c.points[0]}
      <button class="mark" class:ref={c.points.length === 1 && p.kind === "ref"} class:cluster={c.points.length > 1} class:sel={c.points.some((q) => q.id === selected)}
        style:left="{c.x}px" style:top="{c.y}px" style:--c={mixed(c) ? "#e8e4dc" : GROUP_COLORS[p.group]}
        title={c.points.length > 1 ? `${c.points.length} points: click to zoom in` : p.label || (p.kind === "ref" ? "Reference" : `Cube, group ${p.group + 1}`)}
        onpointerdown={(e) => e.stopPropagation()} onclick={() => open(c)}>{c.points.length > 1 ? c.points.length : ""}</button>{/each}
    {#each found as { f, s: at } (f.x + ":" + f.y)}<div class="found" style:left="{at!.x}px" style:top="{at!.y}px"
      title="Hidden cube opened here · {when(f.atMs)}{f.byYou ? ' · by you' : ''}"></div>{/each}
    {#each live as { c, s: at } (c.entity)}<div class="live-cube" style:left="{at!.x}px" style:top="{at!.y}px" title="Hidden cube in view"></div>{/each}
    {#if you}<div class="me" class:stale={age > 30} style:left="{you.x}px" style:top="{you.y}px" title="You · {ago(age)}"></div>{/if}
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
        {#if pos}<div class="btns"><button onclick={() => { gx = pos.x.toFixed(0); gy = pos.y.toFixed(0); setGame(); }}>Use my position ({pos.x.toFixed(0)}, {pos.y.toFixed(0)})</button></div>{/if}
        <p class="hint">Three or more references with game coordinates place you on this image{custom ? "" : " instead of the bundled map's own fit"}.
          Stand on the spot in game, put the reference there and use your position.</p>{/if}
      <div class="btns"><button onclick={() => { const id = sel.id; selected = ""; act(() => deletePoint(ui.data, id)); }}>Delete point</button></div>
    </div>{/if}
  </div>

  <div class="map-foot">
    <span class="hint">{num(points.filter((p) => p.kind === "cube").length)} cube spots · {num(points.filter((p) => p.kind === "ref").length)} references
      {#if ownFit} · your fit off by up to {fitError(ownFit, refs).toFixed(0)} px{:else if refs.length} · {refs.length}/3 references with game coordinates{/if}
      · {num(ui.data.map.found.length)} cubes found{#if live.length}{" "}· <b class="live-count">{live.length} in view</b>{/if}
      · {#if !pos}your position: waiting for the game (a teleport or a skill sends it){:else if elsewhere}you are on another map ({pos.mapId}){:else if !fit}your position: needs 3 references{:else}you: {ago(age)}{/if}</span>
    <span class="grow"></span>
    <label class="btn ghost">Import your own map <input type="file" accept="image/png,image/jpeg,image/webp" hidden onchange={pick}></label>
    {#if custom}<button class="ghost" onclick={remove}>Back to the bundled map</button>{/if}
  </div>
  {#if !custom}<p class="hint">Map: AION 2 © NCSOFT, from in-game screenshots (not covered by this app's license).</p>{/if}
</section>

