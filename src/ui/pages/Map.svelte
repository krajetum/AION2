<script lang="ts">
  import { untrack } from "svelte";
  // Map page: three maps (Asmodian, Elyos, Abyss), each the bundled image (src/assets/ncsoft/, © NCSOFT) or one the
  // player imported (kept only on this PC, infra/map-image.ts), with its own points and fit. Two layers, picked in the
  // corner menu: hidden cubes (spots, cubes found and in view) and pets (where their soul points drop, by soul and mob, searchable;
  // recorded here or merged from friends' files). Close markers merge into a numbered one when zoomed out.
  // You are drawn from the meter's position (src-tauri/meter/src/position.rs) through the map's game → pixel fit:
  // the bundled image's own, or the player's references (3+ with game coordinates).
  import { addDrop, addPoint, deleteDrop, deletePoint, importDrops, setItemSoul, setMobSoul, setPointGame, setPointGroup, setPointKind, setPointLabel } from "../../app/map.ts";
  import {
    applyAffine, clusters, dropMap, dropsFile, fitView, foundOn, GROUP_COLORS, invertAffine, MAPS, onMap, petHome, petList,
    lootKind, petOf, readDropsFile, soulOf, toImage, toScreen, worldMap, zoomAt, fitError, isMapKey, type Cluster, type MapKey, type PointKind, type View,
  } from "../../domain/map.ts";
  import { clearMapImage, loadMapImage, saveMapImage } from "../../infra/map-image.ts";
  import { downloadJson } from "../../infra/storage.ts";
  import { act, commit } from "../actions.ts";
  import { num } from "../format.ts";
  import { ICON } from "../icons.ts";
  import { BUNDLED_IMAGE, fitFor, refsOn } from "../maps.ts";
  import { wanted } from "../../domain/pets.ts";
  import { ui } from "../state.svelte.ts";

  type Layer = "cubes" | "pets";
  type Mode = "move" | "add" | "ref";
  // The corner menu's choices are a per-PC convenience: remembered in this webview, safe to lose.
  const remembered = (k: string) => { try { return localStorage.getItem(`aion2-map-${k}`) ?? ""; } catch { return ""; } };
  const remember = (k: string, v: string) => { try { localStorage.setItem(`aion2-map-${k}`, v); } catch { /* not kept */ } };

  let current = $state<MapKey>(isMapKey(remembered("map")) ? (remembered("map") as MapKey) : "asmodian");
  let layer = $state<Layer>(remembered("layer") === "pets" ? "pets" : "cubes");
  let menuOpen = $state(remembered("menu") !== "closed");
  $effect(() => { remember("map", current); remember("layer", layer); remember("menu", menuOpen ? "open" : "closed"); });

  let url = $state<string | null>(null), custom = $state(false), error = $state(""), notice = $state("");
  let size = $state({ w: 0, h: 0 }); // natural image size
  let imageOf = $state<MapKey | null>(null); // the map whose image has loaded
  let vw = $state(0), vh = $state(0);
  let view = $state<View>({ scale: 1, x: 0, y: 0 });
  let mode = $state<Mode>("move"), group = $state(0), selected = $state(""), selectedDrop = $state("");
  let box = $state<HTMLDivElement>(); // inside the {#if}: there only once a map is loaded
  const MODES = $derived<[Mode, string][]>([["move", "Move"], ["add", layer === "pets" ? "Add drop" : "Add cube"], ["ref", "Add reference"]]);

  const allPoints = $derived(ui.data.map.points);
  const points = $derived(allPoints.filter((p) => p.map === current && (layer === "cubes" || p.kind === "ref")));
  const sel = $derived(points.find((p) => p.id === selected));
  const marks = $derived(size.w ? clusters(points, view, 22) : []);
  const refs = $derived(refsOn(allPoints, current));
  const ownFit = $derived(refs.length >= 3 ? fitFor(allPoints, current, true) : null);
  const fit = $derived(fitFor(allPoints, current, custom));

  // You: on this map's image only while the game says you are on it.
  const pos = $derived(ui.meter?.position ?? null);
  const here = $derived(!!pos && onMap(pos.mapId, current));
  const youPx = $derived(fit && pos && here ? applyAffine(fit, pos.x, pos.y) : null);
  const you = $derived(youPx && size.w ? toScreen(view, youPx.x, youPx.y) : null);
  const age = $derived(pos ? Math.max(0, Math.round((ui.now - pos.atMs) / 1000)) : 0);
  const ago = (s: number) => (s < 60 ? `${s} s ago` : `${Math.floor(s / 60)} min ago`);
  // A map load to another page map takes the page there (once per change: you can still look at another map).
  let lastMapId: number | null | undefined = undefined;
  $effect(() => {
    const id = pos?.mapId ?? null;
    if (id === lastMapId) return;
    lastMapId = id;
    const to = MAPS.find((m) => onMap(id, m.key) && (id == null || m.gameIds.includes(id)));
    if (id != null && to && to.key !== untrack(() => current)) current = to.key;
  });

  function shown(x: number, y: number) {
    if (!fit) return null;
    const p = applyAffine(fit, x, y);
    return toScreen(view, p.x, p.y);
  }
  // Hidden cubes from the meter: opened ones (saved, game units) and the ones in view now.
  const found = $derived(size.w && layer === "cubes" ? ui.data.map.found.filter((f) => foundOn(f, current)).map((f) => ({ f, s: shown(f.x, f.y) })).filter((v) => v.s) : []);
  const live = $derived(size.w && layer === "cubes" && here ? (ui.meter?.cubes?.live ?? []).map((c) => ({ c, s: shown(c.x, c.y) })).filter((v) => v.s) : []);
  const when = (t: number) => new Date(t).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  // ---------- pets ----------
  let query = $state(""), pet = $state(remembered("pet"));
  $effect(() => remember("pet", pet));
  // "Only still to collect": spots of pets you own below level 3 or not at all, by the collection the Pets page shows.
  let onlyWanted = $state(remembered("wanted") === "1");
  $effect(() => remember("wanted", onlyWanted ? "1" : ""));
  const collection = $derived(ui.data.pets[ui.meter?.profile?.name ?? ""] ?? Object.values(ui.data.pets).sort((a, b) => b.atMs - a.atMs)[0]);
  const stillWanted = (d: (typeof ui.data.map.pets)[number]) => {
    const id = petOf(d, ui.data.map.kinds);
    return id == null ? d.item == null : wanted(collection, id); // a crystal drops once a collection is done
  };
  const drops = $derived(onlyWanted && collection ? ui.data.map.pets.filter(stillWanted) : ui.data.map.pets);
  const names = $derived(ui.data.map.souls);
  const items = $derived(ui.data.map.items);
  const soul = (d: (typeof drops)[number]) => soulOf(ui.data.map, d);
  const isPet = (d: (typeof drops)[number]) => soul(d).toLowerCase() === pet.toLowerCase();
  const pets = $derived(petList(drops, query, ui.data.map));
  const chosen = $derived(pets.find((e) => e.name.toLowerCase() === pet.toLowerCase()) ?? petList(drops, "", ui.data.map).find((e) => e.name.toLowerCase() === pet.toLowerCase()));
  // The chosen soul's mobs whose kills gave soul points (a crystal is named by its item, not its mob).
  const pointMobs = $derived((chosen?.mobs ?? []).filter((m) => drops.some((d) => d.item == null && d.mob?.toLowerCase() === m.toLowerCase())));
  // Your last loots this session, one per item and mob, newest first: name the ones that are a pet's crystal.
  // Likely crystals first; each kill's common item hidden unless "Show every loot" (lootKind: a guess from the codes).
  let everyLoot = $state(false);
  const lastLoots = $derived.by(() => {
    const out: { item: number; mob: string; atMs: number; kind: ReturnType<typeof lootKind> }[] = [];
    for (const l of [...(ui.meter?.loots ?? [])].reverse()) {
      const kind = lootKind(l.item);
      if ((everyLoot || kind !== "common") && !out.some((o) => o.item === l.item && o.mob === l.mob)) out.push({ item: l.item, mob: l.mob, atMs: l.atMs, kind });
      if (out.length >= 12) break;
    }
    return out.sort((a, b) => Number(b.kind === "crystal") - Number(a.kind === "crystal"));
  });
  const petName = $derived((pet || query).trim());
  // The chosen soul, while it is in the list: one the "still to collect" filter hides (or with no spots left) is
  // not chosen, so the map shows every spot instead of nothing (2026-10-26).
  const active = $derived(pet && petList(drops, "", ui.data.map).some((e) => e.name.toLowerCase() === pet.toLowerCase()) ? pet : "");
  const onThisMap = $derived(drops.filter((d) => dropMap(d) === current));
  // A pet chosen: its drops, bright; none: every drop on this map, dimmer.
  const petDrops = $derived(size.w && layer === "pets"
    ? onThisMap.filter((d) => !active || isPet(d)).map((d) => ({ d, s: shown(d.x, d.y) })).filter((v) => v.s)
    : []);
  const selDrop = $derived(drops.find((d) => d.id === selectedDrop));
  function choosePet(name: string) {
    pet = pet.toLowerCase() === name.toLowerCase() ? "" : name;
    selectedDrop = "";
    if (!pet) return;
    const home = petHome(drops, pet, ui.data.map);
    if (home && home !== current && !onThisMap.some(isPet)) current = home;
    focusPet = true;
  }
  // After choosing a pet: the view frames its drops on this map (once the image and its fit are there).
  let focusPet = $state(false);
  $effect(() => {
    if (!focusPet || imageOf !== current || !size.w || !vw || !fit) return;
    const px = onThisMap.filter(isPet).map((d) => applyAffine(fit!, d.x, d.y));
    untrack(() => {
      focusPet = false;
      if (!px.length) return;
      follow = false;
      const xs = px.map((p) => p.x), ys = px.map((p) => p.y), pad = 120;
      const w = Math.max(...xs) - Math.min(...xs) + pad * 2, h = Math.max(...ys) - Math.min(...ys) + pad * 2;
      const free = vw - (menuOpen && vw > 640 ? 320 : 0); // the part of the map the corner menu leaves free
      const scale = Math.min(1.5, Math.max(minScale, Math.min(free / w, vh / h)));
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
      view = { scale, x: free / 2 - cx * scale, y: vh / 2 - cy * scale };
    });
  });
  const me = () => ui.meter?.profile?.name ?? "";
  function dropHere() {
    if (!pos || !petName) return;
    const map = here ? current : MAPS.find((m) => onMap(pos.mapId, m.key))?.key ?? current;
    act(() => { selectedDrop = addDrop(ui.data, petName, map, pos.mapId, pos.x, pos.y, pos.z, me()).id; });
    if (!pet) pet = petName;
    notice = `${petName}: drop saved where you stand.`;
  }
  function exportDrops() {
    downloadJson(`aion2-pet-drops-${(me() || "player").replace(/[^\w-]+/g, "_")}-${new Date().toISOString().slice(0, 10)}.json`, dropsFile(ui.data.map)); // every spot, whatever the filter shows
    notice = `${num(ui.data.map.pets.length)} drops saved to your Downloads folder: send the file to whoever collects them.`;
  }
  async function pickDrops(e: Event) {
    const input = e.currentTarget as HTMLInputElement, file = input.files?.[0];
    input.value = "";
    if (!file) return;
    error = ""; notice = "";
    try {
      const incoming = readDropsFile(JSON.parse(await file.text()));
      let added = 0;
      act(() => { added = importDrops(ui.data, incoming.drops, incoming); });
      notice = `${num(added)} new drops added (${num(incoming.drops.length - added)} already here).`;
    } catch (err) { error = `Could not read the drops file: ${err instanceof Error ? err.message : err}`; }
  }

  // ---------- follow ----------
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

  // ---------- image ----------
  async function load(map: MapKey) {
    try {
      const blob = await loadMapImage(map);
      if (map !== current) return; // switched again meanwhile
      if (custom && url) URL.revokeObjectURL(url);
      custom = !!blob;
      const next = blob ? URL.createObjectURL(blob) : BUNDLED_IMAGE[map];
      if (next !== url) { size = { w: 0, h: 0 }; imageOf = null; } else imageOf = map;
      url = next;
      zoomedIn = false;
    } catch (e) { error = `Could not read the saved map: ${e}`; }
  }
  $effect(() => { const m = current; selected = ""; selectedDrop = ""; load(m); });
  $effect(() => () => { if (custom && url) URL.revokeObjectURL(url); });

  // Points are image pixels: on another image they land in other places.
  const moveOn = () => !allPoints.some((p) => p.map === current) || confirm("Your points are placed on the current map image. On a different image they will be in the wrong places. Continue?");

  async function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement, file = input.files?.[0];
    input.value = "";
    if (!file || !moveOn()) return;
    error = "";
    try { await saveMapImage(current, file); await load(current); } catch (err) { error = `Could not save the map: ${err}`; }
  }
  async function remove() {
    if (!moveOn()) return;
    await clearMapImage(current);
    await load(current);
  }

  const refit = () => { if (size.w && vw) view = fitView(size.w, size.h, vw, vh); };
  function loaded(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    size = { w: img.naturalWidth, h: img.naturalHeight };
    refit();
    imageOf = current;
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

  // Drag pans; a click without a drag adds a point / a drop (in an add mode) or clears the selection.
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
    if (mode === "move" || p.x < 0 || p.y < 0 || p.x > size.w || p.y > size.h) { selected = ""; selectedDrop = ""; return; }
    if (mode === "add" && layer === "pets") return addDropAt(p.x, p.y);
    const kind: PointKind = mode === "ref" ? "ref" : "cube";
    act(() => { selected = addPoint(ui.data, current, p.x, p.y, kind, group).id; });
  }
  // A drop placed by a click: back to game units through the map's fit.
  const inverse = $derived(fit ? invertAffine(fit) : null);
  function addDropAt(px: number, py: number) {
    error = "";
    if (!petName) { error = "Pick or type a pet first (corner menu)."; return; }
    if (!inverse) { error = "This map has no fit yet: put 3 references with game coordinates first."; return; }
    const g = applyAffine(inverse, px, py);
    const mapId = here && pos ? pos.mapId : worldMap(current).gameIds[0] ?? null;
    act(() => { selectedDrop = addDrop(ui.data, petName, current, mapId, g.x, g.y, 0, me()).id; });
    if (!pet) pet = petName;
  }

  function open(c: Cluster) {
    if (c.points.length === 1) { selected = c.points[0].id; selectedDrop = ""; return; }
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
  const mapName = (k: MapKey) => worldMap(k).name;
</script>

<p class="hint dps-note">Hidden cubes and where pets' soul points drop on the Asmodian, Elyos and Abyss maps (corner menu): every kill
  of yours that gives soul points is put where the mob died (desktop app with the meter running). Each map can use your own image
  instead of the bundled one: it stays only on this PC. The gold dot is you: the game says where you are on teleports and whenever a
  buff or skill of yours lands, so it follows you with a few seconds' lag (desktop app with the meter running).</p>
{#if error}<p class="hint error">{error}</p>{/if}
{#if notice}<p class="hint">{notice}</p>{/if}

<section class="map-page">
  <div class="map-tools">
    <div class="seg" role="group" aria-label="Click on the map to">{#each MODES as [m, label]}
      <button class:on={mode === m} aria-pressed={mode === m} onclick={() => { mode = m; }}>{label}</button>{/each}</div>
    {#if layer === "cubes"}<div class="swatches" role="group" aria-label="Spawn group for new cubes">{#each GROUP_COLORS as c, i}
      <button class="swatch" class:on={group === i} style:--c={c} aria-pressed={group === i} aria-label="Group {i + 1}" title="Group {i + 1}"
        onclick={() => { group = i; }}></button>{/each}</div>{/if}
    <span class="grow"></span>
    <button class="ghost" aria-label="Zoom out" title="Zoom out" onclick={() => zoom(1 / 1.5)}>−</button>
    <button class="ghost" aria-label="Zoom in" title="Zoom in" onclick={() => zoom(1.5)}>+</button>
    <button class="ghost" onclick={refit}>Fit</button>
    {#if youPx}<button class="ghost" class:on={follow} aria-pressed={follow} title="Keep the map centred on you (dragging the map stops it)"
      onclick={() => { follow = !follow; if (follow) centerOnMe(); }}>{follow ? "Following you" : "Follow me"}</button>{/if}
  </div>

  <div class="map-view" class:adding={mode !== "move"} class:gliding={follow && !!youPx} bind:this={box} bind:clientWidth={vw} bind:clientHeight={vh}
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={() => { drag = null; }} role="application" aria-label="Map">
    {#if url}<img src={url} alt="" draggable="false" onload={loaded}
      style:transform="translate({view.x}px, {view.y}px) scale({view.scale})">
    {:else}<div class="map-empty"><p>No {mapName(current)} map image yet.</p>
      <label class="btn" onpointerdown={(e) => e.stopPropagation()}>Import a map image <input type="file" accept="image/png,image/jpeg,image/webp" hidden onchange={pick}></label></div>{/if}
    {#each marks as c (c.points.map((p) => p.id).join())}{@const p = c.points[0]}
      <button class="mark" class:ref={c.points.length === 1 && p.kind === "ref"} class:cluster={c.points.length > 1} class:sel={c.points.some((q) => q.id === selected)}
        style:left="{c.x}px" style:top="{c.y}px" style:--c={mixed(c) ? "#e8e4dc" : GROUP_COLORS[p.group]}
        title={c.points.length > 1 ? `${c.points.length} points: click to zoom in` : p.label || (p.kind === "ref" ? "Reference" : `Cube, group ${p.group + 1}`)}
        onpointerdown={(e) => e.stopPropagation()} onclick={() => open(c)}>{c.points.length > 1 ? c.points.length : ""}</button>{/each}
    {#each found as { f, s: at } (f.x + ":" + f.y)}<div class="found" style:left="{at!.x}px" style:top="{at!.y}px"
      title="Hidden cube opened here · {when(f.atMs)}{f.byYou ? ' · by you' : ''}"></div>{/each}
    {#each live as { c, s: at } (c.entity)}<div class="live-cube" style:left="{at!.x}px" style:top="{at!.y}px" title="Hidden cube in view"></div>{/each}
    {#each petDrops as { d, s: at } (d.id)}<button class="pet-drop" class:dim={!active} class:sel={d.id === selectedDrop} style:left="{at!.x}px" style:top="{at!.y}px"
      aria-label="{soul(d)} soul points" title="{soul(d)}{d.mob && d.mob !== soul(d) ? ` · from ${d.mob}` : ''} · {when(d.atMs)}{d.by ? ` · ${d.by}` : ''}"
      onpointerdown={(e) => e.stopPropagation()} onclick={() => { selectedDrop = d.id; selected = ""; }}></button>{/each}
    {#if you}<div class="me" class:stale={age > 30} style:left="{you.x}px" style:top="{you.y}px" title="You · {ago(age)}"></div>{/if}

    <!-- Corner menu: which map, which layer, and for pets the search, the list and the drop tools. -->
    <div class="map-menu" role="dialog" aria-label="Map menu" tabindex="-1" onpointerdown={(e) => e.stopPropagation()}>
      <div class="map-menu-head">
        <div class="seg" role="group" aria-label="Map">{#each MAPS as m}
          <button class:on={current === m.key} aria-pressed={current === m.key} onclick={() => { current = m.key; }}>{m.name}</button>{/each}</div>
        <button class="ghost" aria-expanded={menuOpen} aria-label={menuOpen ? "Hide the menu" : "Show the menu"} title={menuOpen ? "Hide" : "Show"}
          onclick={() => { menuOpen = !menuOpen; }}>{menuOpen ? "▴" : "▾"}</button>
      </div>
      {#if menuOpen}
        <div class="seg" role="group" aria-label="Show">
          <button class:on={layer === "cubes"} aria-pressed={layer === "cubes"} onclick={() => { layer = "cubes"; selectedDrop = ""; }}>Cubes</button>
          <button class:on={layer === "pets"} aria-pressed={layer === "pets"} onclick={() => { layer = "pets"; selected = ""; }}>Pets</button></div>
        {#if layer === "pets"}
          <input type="search" placeholder="Search a soul or a mob" aria-label="Search a soul or a mob" autocomplete="off" bind:value={query}>
          <label class="toggle-line" title={collection ? "Hides the spots of pets you have at level 3 (Pets page)" : "Open the Pets menu in game once, with the companion running"}>
            <input type="checkbox" bind:checked={onlyWanted} disabled={!collection} onchange={() => { if (onlyWanted) { pet = ""; selectedDrop = ""; } }}> Only pets still to collect</label>
          {#if active}<button class="ghost showing" title="Show every soul's spots" onclick={() => { pet = ""; selectedDrop = ""; }}>Showing: {active} ✕</button>{/if}
          <ul class="pet-list" aria-label="Pets">
            {#each pets as e (e.name)}<li><button class:on={pet.toLowerCase() === e.name.toLowerCase()} aria-pressed={pet.toLowerCase() === e.name.toLowerCase()}
              onclick={() => choosePet(e.name)}><span class="name">{e.name}</span>
              <span class="hint">{e.mobs.length ? `from ${e.mobs.join(", ")} · ` : ""}{e.drops ? `${num(e.drops)} spot${e.drops === 1 ? "" : "s"}` : "no spots yet"}{e.maps.length ? ` · ${e.maps.map(mapName).join(", ")}` : ""}</span></button></li>
            {:else}<li class="hint">{query.trim() ? `No soul or mob named like "${query.trim()}" yet.` : "No souls yet: kill a mob that gives soul points (meter running) and it joins the list."}</li>{/each}
          </ul>
          {#if active && !onThisMap.some(isPet)}<p class="hint">No {active} spots on the {mapName(current)} map.</p>{/if}
          {#if chosen && pointMobs.length}<div class="soul-mobs"><span class="hint">The soul each mob gives (a mob's name is not always its soul's):</span>
            {#each pointMobs as mob (mob)}<label class="setting"><span>{mob}</span>
              <input list="soul-names" value={names[mob.toLowerCase()] ?? chosen.name} aria-label="Soul of {mob}" autocomplete="off"
                onchange={(e) => { const v = (e.currentTarget as HTMLInputElement).value; act(() => setMobSoul(ui.data, mob, v)); if (v.trim()) pet = v.trim(); }}></label>{/each}
            </div>{/if}
          <datalist id="soul-names">{#each petList(drops, "", ui.data.map) as e (e.name)}<option value={e.name}></option>{/each}</datalist>
          <details class="soul-mobs">
            <summary class="hint">Your last loots: name a pet's crystal ({num(Object.keys(items).length)} named)</summary>
            <span class="hint">Once a pet's collection is done its mobs drop a crystal instead of soul points. Write which pet's an item is,
              once: from then on its drops go on the map, this session's included.</span>
            <label class="toggle-line"><input type="checkbox" bind:checked={everyLoot}> Show every loot (each kill's usual item too)</label>
            {#each lastLoots as l (l.item + ":" + l.mob)}<label class="setting" class:likely={l.kind === "crystal"}><span>{l.mob || "Unknown mob"} · <span class="num">{l.item}</span>
              {#if l.kind === "crystal"}<small class="likely-tag">likely crystal</small>{/if}</span>
              <input list="soul-names" value={items[String(l.item)] ?? ""} placeholder="Not a crystal" aria-label="Crystal of (item {l.item})" autocomplete="off"
                onchange={(e) => { const v = (e.currentTarget as HTMLInputElement).value; act(() => setItemSoul(ui.data, l.item, v)); if (v.trim()) pet = v.trim(); }}></label>
            {:else}<span class="hint">{everyLoot ? "No loot yet this session (desktop app with the meter running)." : "No crystal or unusual item yet this session."}</span>{/each}
          </details>
          <div class="btns">
            <button disabled={!pos || !petName} title={!pos ? "Needs your position from the meter (desktop app)" : !petName ? "Pick or type the soul first" : "Saves your position now, for kills the meter missed"}
              onclick={dropHere}>Soul points here{petName ? `: ${petName}` : ""}</button>
          </div>
          <div class="btns">
            <button class="ghost" disabled={!ui.data.map.pets.length} onclick={exportDrops}>Export drops</button>
            <label class="btn ghost">Import a friend's drops <input type="file" accept="application/json,.json" hidden onchange={pickDrops}></label>
          </div>
        {/if}
      {/if}
    </div>

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
        <p class="hint">Three or more references with game coordinates place you on this image{custom || !worldMap(current).fit ? "" : " instead of the bundled map's own fit"}.
          Stand on the spot in game, put the reference there and use your position.</p>{/if}
      <div class="btns"><button onclick={() => { const id = sel.id; selected = ""; act(() => deletePoint(ui.data, id)); }}>Delete point</button></div>
    </div>{/if}

    {#if selDrop}<div class="map-panel" role="dialog" aria-label="Soul points" tabindex="-1" onpointerdown={(e) => e.stopPropagation()}>
      <h2>{soul(selDrop)} <span class="count">{selDrop.mob ? `from ${selDrop.mob}` : "soul points"}</span>
        <button class="ghost" aria-label="Close" title="Close" onclick={() => { selectedDrop = ""; }}>{@html ICON.close}</button></h2>
      <p class="hint">{when(selDrop.atMs)}{selDrop.by ? ` · recorded by ${selDrop.by}` : ""} · game x {selDrop.x}, y {selDrop.y}{selDrop.mapId != null ? ` · map ${selDrop.mapId}` : ""}</p>
      <div class="btns"><button onclick={() => { const id = selDrop.id; selectedDrop = ""; act(() => deleteDrop(ui.data, id)); }}>Delete drop</button></div>
    </div>{/if}
  </div>

  <div class="map-foot">
    <span class="hint">{mapName(current)} map ·
      {#if layer === "cubes"}{num(points.filter((p) => p.kind === "cube").length)} cube spots · {num(ui.data.map.found.filter((f) => foundOn(f, current)).length)} cubes found{#if live.length}{" "}· <b class="live-count">{live.length} in view</b>{/if}
      {:else}{num(onThisMap.length)} soul point spots here · {num(drops.length)} in all{/if}
      · {num(refs.length)} references{#if ownFit} · your fit off by up to {fitError(ownFit, refs).toFixed(0)} px{:else if refs.length} · {refs.length}/3 with game coordinates{/if}
      · {#if !pos}your position: waiting for the game (a teleport or a skill sends it){:else if pos.mapId == null}<b>which map you are on is not known yet: open the game's map (M) once, or teleport</b>{:else if !here}you are on another map ({pos.mapId}){:else if !fit}your position: this map needs 3 references{:else}you: {ago(age)}{/if}</span>
    <span class="grow"></span>
    <label class="btn ghost">Import your own {mapName(current)} map <input type="file" accept="image/png,image/jpeg,image/webp" hidden onchange={pick}></label>
    {#if custom && BUNDLED_IMAGE[current]}<button class="ghost" onclick={remove}>Back to the bundled map</button>{:else if custom}<button class="ghost" onclick={remove}>Remove the image</button>{/if}
  </div>
  {#if !custom && url}<p class="hint">Map: AION 2 © NCSOFT, from in-game screenshots (not covered by this app's license).</p>{/if}
</section>
