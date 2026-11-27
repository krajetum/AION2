<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { isTauri } from "@tauri-apps/api/core";
  import { Input } from "$lib/components/ui/input/index.js";
  import { NativeSelect, NativeSelectOption } from "$lib/components/ui/native-select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  // Player search: the official character search and profiles (infra/armory.ts), as on NCSOFT's site.
  import { onDestroy } from "svelte";
  import { pickFound, profilePage, startingWith, type Found } from "../../domain/armory.ts";
  import { gearUrl, REGIONS, regionOf } from "../../domain/servers.ts";
  import { searchPlayers, searchRegion, within } from "../../infra/armory.ts";
  import { CharacterSheet, CARRY, RANKS } from "../parts/sheet.svelte.ts";
  import UpgradeCards from "../parts/UpgradeCards.svelte";
  import UpgradeInfo from "../parts/UpgradeInfo.svelte";
  import UnderlineTabs from "$lib/components/app/UnderlineTabs.svelte";
  import LayoutDashboard from "@lucide/svelte/icons/layout-dashboard";
  import Shirt from "@lucide/svelte/icons/shirt";
  import CircleArrowUp from "@lucide/svelte/icons/circle-arrow-up";
  import ChartColumn from "@lucide/svelte/icons/chart-column";
  import Hexagon from "@lucide/svelte/icons/hexagon";
  import Zap from "@lucide/svelte/icons/zap";
  import ArrowLeftRight from "@lucide/svelte/icons/arrow-left-right";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import Info from "@lucide/svelte/icons/info";
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
  import { num } from "../format.ts";
  import DaevanionBoards from "../parts/DaevanionBoards.svelte";
  import Equipment from "../parts/Equipment.svelte";
  import GearTab from "../parts/GearTab.svelte";
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
  // The opened character's data, read once for every tab (parts/sheet.svelte.ts).
  let sheet = $state<CharacterSheet | null>(null);
  const profile = $derived(sheet?.profile ?? null);
  type TabId = "overview" | "gear" | "upgrades" | "stats" | "dae" | "skills" | "compare";
  let tab = $state<TabId>("overview"), info = $state(false);
  const tabs = $derived([
    ["overview", "Overview", LayoutDashboard], ["gear", "Gear", Shirt],
    ["upgrades", "Upgrades", CircleArrowUp, sheet?.reading ? undefined : sheet?.toImprove || undefined],
    ["stats", "Stats", ChartColumn], ["dae", "Daevanion", Hexagon], ["skills", "Skills", Zap], ["compare", "Compare", ArrowLeftRight],
  ] as const);
  const daeOpen = $derived((profile?.boards ?? []).reduce((a, b) => ({ open: a.open + b.open, total: a.total + b.total }), { open: 0, total: 0 }));
  function openSheet(c: Found) {
    sheet?.dispose();
    sheet = new CharacterSheet(c);
    sheet.load();
  }
  onDestroy(() => sheet?.dispose());
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

  let want = asked?.serverId ?? 0;
  let runs = 0; // a newer search replaces the one still running // the server a card or "My character" asked for, to open that one among several
  async function search() {
    const n = name.trim();
    if (!n || !region) return;
    searching = true; error = ""; open = null; sheet?.dispose(); sheet = null; found = []; progress = null; term = n; containing = false; page = 0;
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
  function show(c: Found) {
    open = c; resultsOpen = false;
    if (!first) tab = "overview";
    remember(c);
    openSheet(c);
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
  const genus = $derived(open && sheet?.profile ? ui.data.genus?.[open.name] ?? Object.entries(ui.data.genus ?? {}).find(([n]) => n.toLowerCase() === open!.name.toLowerCase())?.[1] ?? null : null);
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

{#if open && sheet}<Panel>
  {#snippet head()}<span class="flex min-w-0 items-center gap-3">
    <span class="grid size-11 shrink-0 place-items-center rounded-lg bg-muted">{#if profile && classIcon(profile.className)}<img class="size-8 object-contain" src={classIcon(profile.className)} alt="">{:else}<UserIcon class="text-muted-foreground" />{/if}</span>
    <span class="flex min-w-0 flex-col"><span class="flex items-center gap-2 text-lg font-semibold">{open!.name}{#if !isTauri()}<Badge variant="secondary" title="Browser preview: demo data, not the official site">Demo</Badge>{/if}</span>
      <span class="text-xs font-normal text-muted-foreground">{profile ? `${profile.className} · ` : ""}{open!.serverName}{profile?.level != null ? ` · Lv ${profile.level}` : ""}</span></span></span>{/snippet}
  {#snippet actions()}
    {#if profile}<Button size="sm" variant="outline" onclick={() => { tab = "compare"; }}><ArrowLeftRight />Compare</Button>{/if}
    <Button size="icon-sm" variant="ghost" href={profilePage(open!.characterId, open!.serverId)} target="_blank" rel="noopener" aria-label="Official profile" title="Official profile"><ExternalLink /></Button>
    {#if gearUrl(open!.name, open!.serverId)}<Button size="sm" variant="ghost" href={gearUrl(open!.name, open!.serverId)} target="_blank" rel="noopener">shugo.gg</Button>{/if}{/snippet}
  {#if sheet.loading}<p class="hint mt-0">Reading the profile…</p>
  {:else if sheet.error}<p class="hint error mt-0">The profile could not be read ({sheet.error}).
    <Button variant="link" size="sm" class="px-1" onclick={() => open && openSheet(open)}>Try again</Button></p>
  {:else if profile}
    <div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
      <Kpi label="Combat power" value={profile.combatPower == null ? "—" : num(profile.combatPower)} cls="hero" sub={profile.title || " "} />
      <Kpi label="Item level" value={profile.itemLevel == null ? "—" : num(profile.itemLevel)} sub={profile.raceName || " "} />
      <Kpi label="BiS lines" value={sheet.bisCount.total ? `${sheet.bisCount.has} / ${sheet.bisCount.total}` : "—"} sub={sheet.reading ? `reading ${sheet.reading.read} / ${sheet.reading.total} pieces…` : "ideal lines on the pieces"} />
      <Kpi label="Daevanion" value={daeOpen.total ? `${daeOpen.open} / ${daeOpen.total}` : "—"} sub="nodes open" />
    </div>
  {/if}
</Panel>

{#if profile}
  <div class="mb-3"><UnderlineTabs label="Profile" items={tabs} value={tab} onchange={(v) => { tab = v; }} /></div>
  {#if tab === "overview" || tab === "stats"}
    {#if profile.stats?.length}<Table.Root>
      <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Stat</Table.Head><Table.Head class="text-right">Value</Table.Head><Table.Head>Gives</Table.Head></Table.Row></Table.Header>
      <Table.Body>{#each profile.stats as s (s.name)}<Table.Row><Table.Cell>{s.name}</Table.Cell><Table.Cell class="text-right">{num(s.value)}</Table.Cell><Table.Cell class="whitespace-normal text-muted-foreground">{s.effects.join(" · ")}</Table.Cell></Table.Row>{/each}</Table.Body>
    </Table.Root>{/if}
  {:else if tab === "gear"}
    <GearTab {sheet} />
  {:else if tab === "skills"}
    <Equipment {sheet} />
    {#if tab === "skills"}<div class="mt-4">{#if genus}<GenusInsight g={genus} />{:else if me && open.name.toLowerCase() === me.name.toLowerCase()}<p class="hint m-0">Genus Insight: the game sends it when you enter the world. Log in (or change character) with the companion open to see it here.</p>{/if}</div>{/if}
  {:else if tab === "upgrades"}
    <div class="mb-3 flex items-center gap-2"><Button size="sm" variant="ghost" aria-pressed={info} onclick={() => { info = !info; }}><Info />How it's scored</Button></div>
    {#if info}<UpgradeInfo example={sheet.upgrades.plans.find((x) => x.plan.steps.length) ?? null} ranked={sheet.upgrades.plans.some((x) => x.ranked)} />{/if}
    <UpgradeCards plans={sheet.upgrades.plans} ranks={RANKS} totals={sheet.upgrades.totals} arcana={sheet.upgrades.arcana} notUnique={sheet.upgrades.notUnique}
      reading={!!sheet.reading} className={sheet.className} players={CARRY.players[sheet.className] ?? 0} source={CARRY} />
  {:else if tab === "dae"}
    {#if profile.boards?.length}<DaevanionBoards characterId={open.characterId} serverId={open.serverId} boards={profile.boards} />{:else}<p class="hint">No Daevanion board read.</p>{/if}
  {:else if tab === "compare"}
    {#if first && !comparing}<p class="hint mt-0 mb-3">Comparing with <b>{first.name}</b>: search and open the other character.
      <Button size="sm" variant="ghost" onclick={() => { first = null; }}>Cancel</Button></p>{/if}
    {#if compareError}<p class="hint error">Compare: {compareError}</p>{/if}
    {#if comparing}<PlayerCompare a={first!} b={open!} onswap={swap} onclose={() => { first = null; }} />
    {:else if !first}<div class="flex gap-2">{#if me && !isMe(open)}<Button size="sm" variant="outline" onclick={compareWithMe}>Compare with {me.name}</Button>{/if}
      <Button size="sm" variant="outline" onclick={startCompare}>Compare with…</Button></div>{/if}
  {/if}
{/if}{/if}
