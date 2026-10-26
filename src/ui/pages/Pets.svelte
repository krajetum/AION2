<script lang="ts">
  // Pets page: your pet collection as the game sent it when its Pets menu opened (src-tauri/meter/src/pets.rs),
  // with the soul points gained since, and where each pet's soul points drop (the Map page's spots, by pet number).
  import { setPetName } from "../../app/map.ts";
  import { petOf, soulOf } from "../../domain/map.ts";
  import { MAX_LEVEL, maxed, needed, petName, type Pet } from "../../domain/pets.ts";
  import { act, commit } from "../actions.ts";
  import { hm, num } from "../format.ts";
  import { ICON } from "../icons.ts";
  import { ui } from "../state.svelte.ts";

  type Filter = "wanted" | "all" | "maxed";
  const FILTERS: [Filter, string][] = [["wanted", "Still to collect"], ["all", "All"], ["maxed", "Level 3"]];
  let filter = $state<Filter>("wanted"), query = $state("");

  // Yours: the character the meter says you play, else the one read last.
  const me = $derived(ui.meter?.profile?.name || Object.entries(ui.data.pets).sort((a, b) => b[1].atMs - a[1].atMs)[0]?.[0] || "");
  const collection = $derived(ui.data.pets[me]);
  const map = $derived(ui.data.map);
  // Spots on the maps, by pet number.
  const spots = $derived.by(() => {
    const by = new Map<number, typeof map.pets>();
    for (const d of map.pets) {
      const id = petOf(d, map.kinds);
      if (id != null) by.set(id, [...(by.get(id) ?? []), d]);
    }
    return by;
  });
  // Owned pets, and pets not owned that have spots (seen dropping soul points).
  const rows = $derived.by(() => {
    const out: Pet[] = [...(collection?.pets ?? [])];
    for (const id of spots.keys()) if (!out.some((p) => p.id === id)) out.push({ id, level: 0, points: 0 });
    const q = query.trim().toLowerCase();
    return out
      .filter((p) => filter === "all" || (filter === "maxed" ? maxed(p) : !maxed(p)))
      .filter((p) => !q || name(p.id).toLowerCase().includes(q) || String(p.id).includes(q))
      // Closest to the next level first: the cheapest to finish.
      .sort((a, b) => (maxed(a) ? 1 : 0) - (maxed(b) ? 1 : 0) || share(b) - share(a) || a.id - b.id);
  });
  const name = (id: number) => petName(id, map.petNames, map.kinds);
  const share = (p: Pet) => (needed(p) ? p.points / needed(p) : 1);
  const owned = $derived(collection?.pets.filter((p) => p.level > 0).length ?? 0);
  const full = $derived(collection?.pets.filter(maxed).length ?? 0);

  function showOnMap(id: number) {
    const first = spots.get(id)?.[0];
    if (!first) return;
    // The Map page keeps its corner menu's choices here (Map.svelte `remember`).
    try {
      localStorage.setItem("aion2-map-layer", "pets");
      localStorage.setItem("aion2-map-pet", soulOf(map, first));
    } catch { /* the page opens on its last choice */ }
    ui.tab = "map";
    history.replaceState(null, "", "#map");
  }
</script>

<p class="hint dps-note">Your pets as the game sent them the last time you opened its Pets menu with the companion running, plus the soul
  points your kills gave since. Open the Pets menu in game to refresh. The game sends numbers, not names: a pet is named after the mob
  its soul points came from, and you can rename it. Level {MAX_LEVEL} is the last.</p>

{#if !collection}<section class="empty-fight"><p class="hint">No collection read yet{me ? ` for ${me}` : ""}. Open the Pets menu in game with the companion running (desktop app).</p></section>
{:else}
<section class="dps-table pets-page">
  <h2>{me} <span class="count">{num(owned)} owned · {num(full)} at level {MAX_LEVEL} · read {hm(collection.atMs)}</span></h2>
  <div class="map-tools">
    <div class="seg" role="group" aria-label="Show">{#each FILTERS as [f, label]}
      <button class:on={filter === f} aria-pressed={filter === f} onclick={() => { filter = f; }}>{label}</button>{/each}</div>
    <input type="search" placeholder="Search a pet or a number" aria-label="Search a pet" autocomplete="off" bind:value={query}>
  </div>
  <table>
    <thead><tr><th>Pet</th><th class="num">#</th><th>Level</th><th>Soul points</th><th class="num">Spots</th><th></th></tr></thead>
    <tbody>
      {#each rows as p (p.id)}{@const n = spots.get(p.id)?.length ?? 0}
        <tr class:done={maxed(p)}>
          <td><input class="pet-name" value={map.petNames[String(p.id)] ?? ""} placeholder={name(p.id)} aria-label="Name of pet {p.id}" autocomplete="off"
            onchange={(e) => commit(e, (v) => setPetName(ui.data, p.id, v), () => map.petNames[String(p.id)] ?? "")}></td>
          <td class="num dim">{p.id}</td>
          <td>{p.level ? `Level ${p.level}` : "Not owned"}</td>
          <td>{#if maxed(p)}<span class="dim">done</span>{:else}<span class="pet-progress"><span class="bar" style:--p={share(p)}><i></i></span>
            <span class="num">{p.points}/{needed(p)}</span></span>{/if}</td>
          <td class="num">{n || ""}</td>
          <td>{#if n}<button class="act" title="Open the map on this pet's spots" onclick={() => showOnMap(p.id)}>{@html ICON.map}Show on map</button>{/if}</td>
        </tr>
      {:else}<tr><td colspan="6" class="hint">{query.trim() ? "No pet matches." : filter === "wanted" ? "Every pet you own is at level 3." : "Nothing here."}</td></tr>{/each}
    </tbody>
  </table>
</section>
{/if}
