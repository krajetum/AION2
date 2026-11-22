<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import Intro from "$lib/components/app/Intro.svelte";
  import Panel from "$lib/components/app/Panel.svelte";
  import Empty from "../parts/Empty.svelte";
  // Pets page: your pet collection as the game sent it on entering the world (src-tauri/meter/src/pets.rs),
  // with the soul points gained since, and where each pet's soul points drop (the Map page's spots, by pet number).
  import { setPetName } from "../../app/map.ts";
  import { dropMap, MAPS, petOf, soulOf, worldMap, type MapKey } from "../../domain/map.ts";
  import { KNOWN_PET_NAMES, PET_TYPE, PET_TYPES, type PetType } from "../../domain/pet-names.ts";
  import { MAX_LEVEL, maxed, needed, petName, type Pet } from "../../domain/pets.ts";
  import { commit } from "../actions.ts";
  import { hm, num } from "../format.ts";
  import { ICON } from "../icons.ts";
  import { ui } from "../state.svelte.ts";

  type Filter = "wanted" | "all" | "l0" | "l1" | "l2" | "maxed";
  const FILTERS: [Filter, string][] = [["wanted", "Still to collect"], ["all", "All"], ["l0", "Not owned"], ["l1", "Level 1"], ["l2", "Level 2"], ["maxed", "Level 3"]];
  const shows = (f: Filter, p: Pet) =>
    f === "all" || (f === "wanted" ? !maxed(p) : f === "maxed" ? maxed(p) : p.level === Number(f.slice(1)));
  let filter = $state<Filter>("wanted"), query = $state("");
  // Where its soul points drop: a world map with spots of it, any dungeon, or none known (chests, merchants).
  type Where = "any" | MapKey | "dungeons" | "none";
  const WHERE: [Where, string][] = [["any", "All maps"], ...MAPS.filter((m) => !m.dungeon).map((m): [Where, string] => [m.key, m.name]), ["dungeons", "Dungeons"], ["none", "Chests / Merchant"]];
  let where = $state<Where>("any");
  // Pet type (feral, intellect, nature...) from the database; a pet it doesn't list has none.
  let kind = $state<PetType | "any">("any");
  const KINDS: [PetType | "any", string][] = [["any", "All types"], ...PET_TYPES];
  const typeName = (id: number) => PET_TYPES.find(([t]) => t === PET_TYPE[id])?.[1] ?? "—";
  const mapsOf = (id: number) => [...new Set((spots.get(id) ?? []).map(dropMap).filter((m): m is MapKey => !!m))];
  const placed = (w: Where, id: number) => w === "any" || (w === "none" ? !mapsOf(id).length
    : w === "dungeons" ? mapsOf(id).some((m) => worldMap(m).dungeon) : mapsOf(id).includes(w));

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
  // Owned pets, and the ones not owned: every pet of the database (pet-names.ts) and any other with spots.
  const rows = $derived.by(() => {
    const out: Pet[] = [...(collection?.pets ?? [])];
    const ids = new Set([...spots.keys(), ...Object.keys(KNOWN_PET_NAMES).map(Number)]);
    for (const id of ids) if (!out.some((p) => p.id === id)) out.push({ id, level: 0, points: 0 });
    const q = query.trim().toLowerCase();
    return out
      .filter((p) => shows(filter, p) && placed(where, p.id) && (kind === "any" || PET_TYPE[p.id] === kind))
      .filter((p) => !q || name(p.id).toLowerCase().includes(q) || String(p.id).includes(q)
        || (spots.get(p.id) ?? []).some((d) => d.mob?.toLowerCase().includes(q)))
      // Closest to the next level first: the cheapest to finish.
      .sort((a, b) => (maxed(a) ? 1 : 0) - (maxed(b) ? 1 : 0) || share(b) - share(a) || a.id - b.id);
  });
  const name = (id: number) => petName(id, map.petNames, map.kinds);
  const share = (p: Pet) => (needed(p) ? p.points / needed(p) : 1);
  // Kills recorded by an app older than the Pets page carry no pet number: on the map, not here.
  const unlinked = $derived(map.pets.filter((d) => d.item == null && d.mob && petOf(d, map.kinds) == null).length);
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

<Intro><p>Your pets as the game sent them when you last entered the world (login or character select) with the companion
  running, plus the soul points your kills gave since. Changing character in game reads the whole collection again. The game sends numbers, not names:
  names come from the gamers4.life database, else from the mob its soul points came from, and you can rename any. Level {MAX_LEVEL} is the last.</p></Intro>

{#snippet seg(label: string, items: readonly (readonly [string, string])[], value: string, set: (v: string) => void, title = "")}
  <ToggleGroup.Root type="single" variant="outline" size="sm" aria-label={label} {title} {value} onValueChange={(v) => v && set(v)}>
    {#each items as [id, text]}<ToggleGroup.Item value={id}>{text}</ToggleGroup.Item>{/each}</ToggleGroup.Root>{/snippet}

{#if !collection}<Empty>No collection read yet{me ? ` for ${me}` : ""}. Log in or change character in game with the companion running (desktop app).</Empty>
{:else}
{#if unlinked}<p class="hint mb-3">{num(unlinked)} spot{unlinked === 1 ? "" : "s"} on the map {unlinked === 1 ? "has" : "have"} no pet number
  (recorded with an app older than this page, in a friend's file or in the spots shared with the app): {unlinked === 1 ? "it shows" : "they show"} on the map but not here.
  A mob's name alone does not tell its pet (Young Slink and Slink are two); kills recorded from now on carry the number.</p>{/if}
<Panel title={me} count="{num(owned)} owned · {num(full)} at level {MAX_LEVEL} · read {hm(collection.atMs)}">
  <div class="mb-3 flex flex-wrap items-center gap-2">
    {@render seg("Show", FILTERS, filter, (v) => { filter = v as typeof filter; })}
    {@render seg("Where it drops", WHERE, where, (v) => { where = v as typeof where; }, "Chests / Merchant: no spot on any map yet: soul points from chests or bought from a merchant (or a mob not found yet)")}
    {@render seg("Type", KINDS, kind, (v) => { kind = v as typeof kind; })}
    <Input class="h-8 w-56" type="search" placeholder="Search a pet or a number" aria-label="Search a pet" autocomplete="off" bind:value={query} />
  </div>
  <Table.Root>
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Pet</Table.Head><Table.Head class="text-right">#</Table.Head><Table.Head>Type</Table.Head><Table.Head>Level</Table.Head><Table.Head>Soul points</Table.Head><Table.Head class="text-right">Spots</Table.Head><Table.Head>Maps</Table.Head><Table.Head></Table.Head></Table.Row></Table.Header>
    <Table.Body>
      {#each rows as p (p.id)}{@const n = spots.get(p.id)?.length ?? 0}
        <Table.Row>
          <Table.Cell><Input class="h-7 w-48 border-transparent bg-transparent px-1 font-medium hover:border-input dark:bg-transparent {maxed(p) ? 'text-hps' : ''}" value={map.petNames[String(p.id)] ?? ""} placeholder={name(p.id)} aria-label="Name of pet {p.id}" autocomplete="off"
            onchange={(e) => commit(e, (v) => setPetName(ui.data, p.id, v), () => map.petNames[String(p.id)] ?? "")} /></Table.Cell>
          <Table.Cell class="text-right text-muted-foreground">{p.id}</Table.Cell>
          <Table.Cell class="text-muted-foreground">{typeName(p.id)}</Table.Cell>
          <Table.Cell>{p.level ? `Level ${p.level}` : "Not owned"}</Table.Cell>
          <Table.Cell>{#if maxed(p)}<span class="text-muted-foreground">done</span>{:else}<span class="flex items-center gap-2"><Progress class="w-24" value={share(p) * 100} />
            <span class="tabular-nums">{p.points}/{needed(p)}</span></span>{/if}</Table.Cell>
          <Table.Cell class="text-right">{n || ""}</Table.Cell>
          <Table.Cell class="text-muted-foreground">{mapsOf(p.id).map((m) => worldMap(m).name).join(", ") || "Chests / Merchant"}</Table.Cell>
          <Table.Cell>{#if n}<Button variant="outline" size="sm" title="Open the map on this pet's spots" onclick={() => showOnMap(p.id)}><ICON.map />Show on map</Button>{/if}</Table.Cell>
        </Table.Row>
      {:else}<Table.Row><Table.Cell colspan={8} class="text-muted-foreground">{query.trim() ? "No pet matches." : filter === "wanted" ? "Every pet you own is at level 3." : "No pet at this level."}</Table.Cell></Table.Row>{/each}
    </Table.Body>
  </Table.Root>
</Panel>
{/if}
