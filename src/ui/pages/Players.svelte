<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { isTauri } from "@tauri-apps/api/core";
  import { Input } from "$lib/components/ui/input/index.js";
  import { NativeSelect, NativeSelectOption } from "$lib/components/ui/native-select/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  // Player search: the official character search and profiles (infra/armory.ts), as on NCSOFT's site.
  import { pickFound, profilePage, startingWith, type Found, type Profile } from "../../domain/armory.ts";
  import { gearUrl, REGIONS, regionOf } from "../../domain/servers.ts";
  import { equipmentOf, profileOf, searchPlayers, searchRegion, within } from "../../infra/armory.ts";
  import { classIcon } from "../classes.ts";
  import { hm, num } from "../format.ts";
  import DaevanionBoards from "../parts/DaevanionBoards.svelte";
  import Equipment from "../parts/Equipment.svelte";
  import GenusInsight from "../parts/GenusInsight.svelte";
  import PlayerCompare from "../parts/PlayerCompare.svelte";
  import Kpi from "../parts/Kpi.svelte";
  import { ui } from "../state.svelte.ts";

  const REGION_NAMES: Record<string, string> = { eu: "Europe", nae: "NA East", naw: "NA West", la: "Latin America", as: "Asia" };
  const mine = ui.meter?.profile?.serverId ?? 0;
  // A player card's "Full profile" fills these in (ui.lookup); else your own server.
  const asked = ui.lookup;
  let region = $state(regionOf(asked?.serverId ?? mine) || "eu");
  let name = $state(asked?.name ?? "");

  let found = $state<Found[] | null>(null);
  // The official search matches names containing the text ("Gar" finds Angrabu): only names starting with it are
  // listed, the others behind "Also names containing it".
  let term = $state(""), containing = $state(false);
  const starting = $derived(found ? startingWith(found, term) : []);
  const listed = $derived(found ? (containing ? found : starting) : []);
  let searching = $state(false), error = $state("");
  let progress = $state<{ done: number; failed: number; total: number } | null>(null);
  let open = $state<Found | null>(null);
  let profile = $state<Profile | null>(null), loading = $state(false), profileError = $state("");

  let want = asked?.serverId ?? 0;
  let runs = 0; // a newer search replaces the one still running // the server a card or "My character" asked for, to open that one among several
  async function search() {
    const n = name.trim();
    if (!n || !region) return;
    searching = true; error = ""; open = null; profile = null; found = []; progress = null; term = n; containing = false;
    const run = ++runs;
    // An exact match opens by itself: the one on the server asked for (a card's "Full profile", your character) as soon
    // as that server answers, else the only one once every server has.
    const exactIn = (list: Found[]) => list.filter((c) => c.name.toLowerCase() === n.toLowerCase());
    try {
      // A card or "My character" knows the server: that one search only, the profile opens at once (searching the
      // whole region first made the gear wait, 2026-11-25). "Search" then looks in every server of the region.
      if (want) {
        const list = await within(searchPlayers(n, want));
        if (run !== runs) return;
        const hit = exactIn(list).find((c) => c.serverId === want);
        if (hit) { found = list; progress = null; show(hit); searching = false; return; }
      }
      const r = await searchRegion(n, region, (part) => {
        if (run !== runs) return;
        found = part.found; progress = part;
        const asked = want ? exactIn(part.found).find((c) => c.serverId === want) : null;
        if (asked && !open) show(asked);
      });
      if (run !== runs) return;
      found = r.found; progress = r;
      const exact = exactIn(r.found);
      if (!open && exact.length === 1) show(exact[0]);
    } catch (e) { if (run === runs) { found = null; error = e instanceof Error ? e.message : String(e); } }
    if (run === runs) searching = false;
  }
  // The profile asked for last: `open` is $state, so it holds a proxy of `c` and `open === c` is false for a
  // character the search opened by itself (an exact name): its profile stayed "Reading…" for ever (2026-11-26).
  let shows = 0;
  async function show(c: Found) {
    const run = ++shows;
    open = c; profile = null; profileError = ""; loading = true;
    // The equipment at the same time (cached: the Equipment part takes the same answer when it shows).
    equipmentOf(c.characterId, c.serverId).catch(() => {});
    try {
      const p = await within(profileOf(c.characterId, c.serverId));
      if (run === shows) { profile = p; if (!p) profileError = "the site sent no profile"; }
    } catch (e) { if (run === shows) profileError = e instanceof Error ? e.message : String(e); }
    if (run === shows) loading = false;
  }
  if (asked) { ui.lookup = null; void search(); }

  // The character you play in game opens by itself when nothing else was asked: now, or once the meter says who you are.
  let touched = !!asked;
  const me = $derived(ui.meter?.profile?.name && ui.meter.profile.serverId && regionOf(ui.meter.profile.serverId)
    ? { name: ui.meter.profile.name, serverId: ui.meter.profile.serverId } : null);
  function openMe() {
    if (!me) return;
    touched = true;
    region = regionOf(me.serverId);
    want = me.serverId;
    name = me.name;
    void search();
  }
  $effect(() => { if (me && !touched) openMe(); });
  // Compare: the character kept as the first side; the one opened next (searched, or yours) is the second.
  let first = $state<Found | null>(null), compareError = $state("");
  const comparing = $derived(!!first && !!open && open.characterId !== first.characterId);
  const isMe = (c: Found | null) => !!c && !!me && c.serverId === me.serverId && c.name.toLowerCase() === me.name.toLowerCase();
  function startCompare() { first = open; compareError = ""; }
  async function compareWithMe() {
    if (!me || !open) return;
    compareError = "";
    try {
      const mine = pickFound(await searchPlayers(me.name, me.serverId), me.name, me.serverId);
      if (!mine) { compareError = `${me.name} not found on the official search`; return; }
      first = mine;
    } catch (e) { compareError = e instanceof Error ? e.message : String(e); }
  }
  function swap() { if (first && open) { const was = first; first = open; void show(was); } }

  // Your Genus Insight, read in game: only for your own characters (kept by name; the game sends no one else's).
  const genus = $derived(open && profile ? ui.data.genus?.[open.name] ?? Object.entries(ui.data.genus ?? {}).find(([n]) => n.toLowerCase() === open!.name.toLowerCase())?.[1] ?? null : null);
</script>

<form class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" onsubmit={(e) => { e.preventDefault(); void search(); }}>
  <label class="flex items-center gap-1.5 text-muted-foreground">Name <Input class="w-52" bind:value={name} placeholder="Character name" aria-label="Character name" autocomplete="off" required /></label>
  <label class="flex items-center gap-1.5 text-muted-foreground">Region <NativeSelect bind:value={region}>{#each Object.values(REGIONS) as r}<NativeSelectOption value={r}>{REGION_NAMES[r] ?? r}</NativeSelectOption>{/each}</NativeSelect></label>
  <Button type="submit" onclick={() => { touched = true; want = 0; }}>{searching ? `Searching… ${progress ? `${progress.done}/${progress.total}` : ""}` : "Search"}</Button>
  {#if me && !(open && open.serverId === me.serverId && open.name.toLowerCase() === me.name.toLowerCase())}
    <Button type="button" variant="ghost" title="Back to the character you play in game" onclick={openMe}>← My character ({me.name})</Button>{/if}
</form>
<p class="hint mt-0 mb-3">From the official character search: names starting with what you type (the site finds names containing it: those behind a button), on every server of the region (one search per server: they show as each answers). Only Europe has been checked.</p>
{#if error}<p class="hint error">The search could not be read ({error}).</p>{/if}
{#if !searching && progress?.failed}<p class="hint error">{progress.failed} of {progress.total} servers did not answer: a character there may be missing.
  <Button variant="link" size="sm" class="px-1" onclick={() => search()}>Search again</Button></p>{/if}

{#if found}<Panel title="Characters" count={listed.length}>
  {#snippet actions()}{#if found && found.length > starting.length}
    <Button size="sm" variant="ghost" onclick={() => { containing = !containing; }}>{containing ? "Only names starting with it" : `Also names containing it (${found.length - starting.length})`}</Button>{/if}{/snippet}
  <Table.Root>
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Name</Table.Head><Table.Head class="text-right">Level</Table.Head><Table.Head>Server</Table.Head></Table.Row></Table.Header>
    <Table.Body>{#each listed as c (c.characterId)}<Table.Row data-state={open?.characterId === c.characterId && open?.serverId === c.serverId ? "selected" : undefined}>
      <Table.Cell><Button variant="link" size="sm" class="px-0" onclick={() => show(c)}>{c.name}</Button></Table.Cell><Table.Cell class="text-right">{c.level ?? "—"}</Table.Cell><Table.Cell>{c.serverName}</Table.Cell>
    </Table.Row>{:else}<Table.Row><Table.Cell class="text-muted-foreground" colspan={3}>{searching ? "Searching the region's servers…" : found.length ? "No name starts with that: see the names containing it." : "No character with that name in this region."}</Table.Cell></Table.Row>{/each}</Table.Body>
  </Table.Root>
</Panel>{/if}

{#if first && !comparing}<p class="hint mt-0 mb-3">Comparing with <b>{first.name}</b>: search and open the other character.
  <Button size="sm" variant="ghost" onclick={() => { first = null; }}>Cancel</Button></p>{/if}
{#if compareError}<p class="hint error">Compare: {compareError}</p>{/if}
{#if comparing}<Panel title="Compare">
  <PlayerCompare a={first!} b={open!} onswap={swap} onclose={() => { first = null; }} />
</Panel>{/if}

{#if open && !comparing}<Panel count="{profile?.className ?? ''} · {open.serverName}">
  {#snippet actions()}{#if profile && !comparing}
    {#if me && !isMe(open)}<Button size="sm" variant="outline" onclick={compareWithMe}>Compare with {me.name}</Button>{/if}
    <Button size="sm" variant="outline" disabled={!!first} onclick={startCompare}>Compare with…</Button>{/if}{/snippet}
  {#snippet head()}<span class="flex items-center gap-2">{#if profile && classIcon(profile.className)}<img class="size-6 object-contain" src={classIcon(profile.className)} alt="">{/if}{open!.name}{#if !isTauri()}<Badge variant="secondary" title="Browser preview: demo data, not the official site">Demo</Badge>{/if}</span>{/snippet}
  {#if loading}<p class="hint mt-0">Reading the profile…</p>
  {:else if profileError}<p class="hint error mt-0">The profile could not be read ({profileError}).
    <Button variant="link" size="sm" class="px-1" onclick={() => open && show(open)}>Try again</Button></p>
  {:else if profile}
    <div class="mb-3 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
      <Kpi label="Combat power" value={profile.combatPower == null ? "—" : num(profile.combatPower)} cls="hero" sub={profile.title || " "} />
      <Kpi label="Item level" value={profile.itemLevel == null ? "—" : num(profile.itemLevel)} sub={profile.raceName || " "} />
      <Kpi label="Level" value={profile.level == null ? "—" : String(profile.level)} sub="read {hm(profile.atMs)}" />
    </div>
    <Equipment characterId={open.characterId} serverId={open.serverId} className={profile.className} />
    <h3 class="mt-4 mb-2 text-sm font-semibold">Stats</h3>
    {#if profile.stats?.length}<Table.Root>
      <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Stat</Table.Head><Table.Head class="text-right">Value</Table.Head><Table.Head>Gives</Table.Head></Table.Row></Table.Header>
      <Table.Body>{#each profile.stats as s (s.name)}<Table.Row><Table.Cell>{s.name}</Table.Cell><Table.Cell class="text-right">{num(s.value)}</Table.Cell><Table.Cell class="whitespace-normal text-muted-foreground">{s.effects.join(" · ")}</Table.Cell></Table.Row>{/each}</Table.Body>
    </Table.Root>{/if}
    <div class="mt-4 flex flex-col gap-2">
      {#if profile.boards?.length}<DaevanionBoards characterId={open.characterId} serverId={open.serverId} boards={profile.boards} />{/if}
      {#if genus}<GenusInsight g={genus} />{:else if me && open.name.toLowerCase() === me.name.toLowerCase()}<p class="hint m-0">Genus Insight: the game sends it when you enter the world. Log in (or change character) with the companion open to see it here.</p>{/if}
    </div>
  {/if}
  <p class="mt-3 mb-0 text-sm"><a class="text-primary hover:underline" href={profilePage(open.characterId, open.serverId)} target="_blank" rel="noopener">Official profile ↗</a>
    {#if gearUrl(open.name, open.serverId)} · <a class="text-primary hover:underline" href={gearUrl(open.name, open.serverId)} target="_blank" rel="noopener">shugo.gg ↗</a>{/if}</p>
</Panel>{/if}
