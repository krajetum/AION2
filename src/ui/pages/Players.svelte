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
  import { cleanRecent, pageOf, pageWith, pushRecent, sameCharacter } from "../../domain/players.ts";
  import SearchIcon from "@lucide/svelte/icons/search";
  import UserIcon from "@lucide/svelte/icons/user";
  import UsersIcon from "@lucide/svelte/icons/users";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Clock from "@lucide/svelte/icons/clock";
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
  // Results: folded once a profile is open (the toggle unfolds them), 6 a page.
  let page = $state(0), resultsOpen = $state(false);
  const shownPage = $derived(pageOf(listed, page));
  function toggleResults() {
    resultsOpen = !resultsOpen;
    if (resultsOpen && open) page = pageWith(listed, (c) => sameCharacter(c, open!));
  }
  // Recent: the last 5 characters opened, in localStorage (not the save file).
  const RECENT_KEY = "aion2-players-recent";
  let recent = $state<Found[]>((() => { try { return cleanRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")); } catch { return []; } })());
  function remember(c: Found) {
    recent = pushRecent(recent, { characterId: c.characterId, name: c.name, level: c.level, serverId: c.serverId, serverName: c.serverName });
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* not kept */ }
  }
  let profile = $state<Profile | null>(null), loading = $state(false), profileError = $state("");

  let want = asked?.serverId ?? 0;
  let runs = 0; // a newer search replaces the one still running // the server a card or "My character" asked for, to open that one among several
  async function search() {
    const n = name.trim();
    if (!n || !region) return;
    searching = true; error = ""; open = null; profile = null; found = []; progress = null; term = n; containing = false; page = 0;
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
    open = c; profile = null; profileError = ""; loading = true; resultsOpen = false;
    remember(c);
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

<form class="mb-2 flex flex-wrap items-center gap-2 text-sm" onsubmit={(e) => { e.preventDefault(); void search(); }}>
  <div class="relative min-w-48 flex-1">
    <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    <Input class="pl-8" bind:value={name} placeholder="Character name" aria-label="Character name" autocomplete="off" required
      title="Names starting with what you type, on every server of the region (one search per server). Only Europe has been checked." />
  </div>
  <NativeSelect bind:value={region} aria-label="Region">{#each Object.values(REGIONS) as r}<NativeSelectOption value={r}>{REGION_NAMES[r] ?? r}</NativeSelectOption>{/each}</NativeSelect>
  <Button type="submit" onclick={() => { touched = true; want = 0; }}><SearchIcon />{searching ? `Searching… ${progress ? `${progress.done}/${progress.total}` : ""}` : "Search"}</Button>
  {#if me}<Button type="button" variant="outline" title="The character you play in game" disabled={isMe(open)} onclick={openMe}><UserIcon class="text-primary" />{me.name}</Button>{/if}
</form>
<div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
  {#if found && open}<Button size="sm" variant="ghost" class="-ml-2" aria-expanded={resultsOpen} onclick={toggleResults}>
    <UsersIcon />{listed.length} {listed.length === 1 ? "result" : "results"} for '{term}'<ChevronDown class="transition-transform {resultsOpen ? 'rotate-180' : ''}" /></Button>{/if}
  {#if progress && progress.total > 1}<span class="inline-flex items-center gap-1">{progress.done}/{progress.total} servers{#if progress.failed}, <span class="text-[var(--negative)]">{progress.failed} did not answer</span>{/if}
    {#if !searching && progress.failed}<Button size="xs" variant="ghost" onclick={() => search()}><RefreshCw />Again</Button>{/if}</span>{/if}
  {#if recent.length}<span class="inline-flex flex-wrap items-center gap-1"><Clock class="size-3" />Recent
    {#each recent as c (c.characterId + c.serverId)}<Button size="xs" variant="outline" title="{c.name} · {c.serverName}"
      onclick={() => { touched = true; region = regionOf(c.serverId) || region; show(c); }}>{c.name}</Button>{/each}</span>{/if}
</div>
{#if error}<p class="hint error">The search could not be read ({error}).</p>{/if}

{#if found && (!open || resultsOpen)}<div class="mb-4 rounded-lg border bg-card p-2">
  {#if listed.length}<div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-1">
    {#each shownPage.items as c (c.characterId + c.serverId)}{@const on = !!open && sameCharacter(c, open)}{@const icon = on && profile ? classIcon(profile.className) : undefined}
      <Button variant="ghost" class="h-auto justify-start gap-2.5 px-2 py-1.5 text-left {on ? 'bg-accent' : ''}" onclick={() => show(c)}>
        <span class="grid size-8 shrink-0 place-items-center rounded-md bg-muted">{#if icon}<img class="size-6 object-contain" src={icon} alt="">{:else}<UserIcon class="text-muted-foreground" />{/if}</span>
        <span class="flex min-w-0 flex-col"><span class="truncate font-medium">{c.name}</span><span class="truncate text-xs text-muted-foreground">{on && profile ? `${profile.className} · ` : ""}{c.serverName}</span></span>
        <span class="ml-auto text-xs text-muted-foreground tabular-nums">Lv {c.level ?? "—"}</span>
      </Button>{/each}
  </div>{:else}<p class="hint m-2">{searching ? "Searching the region's servers…" : found.length ? "No name starts with that: see the names containing it." : "No character with that name in this region."}</p>{/if}
  <div class="mt-1 flex items-center gap-2 border-t pt-1.5 text-xs text-muted-foreground">
    {#if found.length > starting.length}<Button size="xs" variant="ghost" onclick={() => { containing = !containing; page = 0; }}>{containing ? "Only names starting with it" : `Also names containing it (${found.length - starting.length})`}</Button>{/if}
    {#if shownPage.pages > 1}<span class="ml-auto flex items-center gap-1">
      <Button size="icon-xs" variant="ghost" aria-label="Previous page" disabled={shownPage.page === 0} onclick={() => { page = shownPage.page - 1; }}><ChevronLeft /></Button>
      <span class="tabular-nums">{shownPage.from}–{shownPage.to} of {listed.length}</span>
      <Button size="icon-xs" variant="ghost" aria-label="Next page" disabled={shownPage.page >= shownPage.pages - 1} onclick={() => { page = shownPage.page + 1; }}><ChevronRight /></Button></span>{/if}
  </div>
</div>{/if}

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
