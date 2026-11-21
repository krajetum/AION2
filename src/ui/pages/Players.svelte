<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { NativeSelect, NativeSelectOption } from "$lib/components/ui/native-select/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  // Player search: the official character search and profiles (infra/armory.ts), as on NCSOFT's site.
  import { profilePage, type Found, type Profile } from "../../domain/armory.ts";
  import { gearUrl, REGIONS, regionOf, serversIn } from "../../domain/servers.ts";
  import { equipmentOf, profileOf, searchPlayers } from "../../infra/armory.ts";
  import { classIcon } from "../classes.ts";
  import { hm, num } from "../format.ts";
  import DaevanionBoards from "../parts/DaevanionBoards.svelte";
  import Equipment from "../parts/Equipment.svelte";
  import GenusInsight from "../parts/GenusInsight.svelte";
  import Kpi from "../parts/Kpi.svelte";
  import { ui } from "../state.svelte.ts";

  const REGION_NAMES: Record<string, string> = { eu: "Europe", nae: "NA East", naw: "NA West", la: "Latin America", as: "Asia" };
  const mine = ui.meter?.profile?.serverId ?? 0;
  // A player card's "Full profile" fills these in (ui.lookup); else your own server.
  const asked = ui.lookup;
  let region = $state(regionOf(asked?.serverId ?? mine) || "eu");
  let serverId = $state(asked?.serverId ?? (regionOf(mine) ? mine : 0));
  let name = $state(asked?.name ?? "");
  const servers = $derived(serversIn(region));
  $effect(() => { if (!servers.some((s) => s.id === serverId)) serverId = servers[0]?.id ?? 0; });

  let found = $state<Found[] | null>(null);
  let searching = $state(false), error = $state("");
  let open = $state<Found | null>(null);
  let profile = $state<Profile | null>(null), loading = $state(false), profileError = $state("");

  async function search() {
    const n = name.trim();
    if (!n || !serverId) return;
    searching = true; error = ""; open = null; profile = null;
    try {
      found = await searchPlayers(n, serverId);
      // An exact match opens by itself.
      const exact = found.filter((c) => c.name.toLowerCase() === n.toLowerCase());
      if (exact.length === 1) show(exact[0]);
    } catch (e) { found = null; error = e instanceof Error ? e.message : String(e); }
    searching = false;
  }
  async function show(c: Found) {
    open = c; profile = null; profileError = ""; loading = true;
    // The equipment at the same time (cached: the Equipment part takes the same answer when it shows).
    equipmentOf(c.characterId, c.serverId).catch(() => {});
    try {
      const p = await profileOf(c.characterId, c.serverId);
      if (open === c) { profile = p; if (!p) profileError = "the site sent no profile"; }
    } catch (e) { if (open === c) profileError = e instanceof Error ? e.message : String(e); }
    if (open === c) loading = false;
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
    serverId = me.serverId;
    name = me.name;
    void search();
  }
  $effect(() => { if (me && !touched) openMe(); });
  // Your Genus Insight, read in game: only for your own characters (kept by name; the game sends no one else's).
  const genus = $derived(open && profile ? ui.data.genus?.[open.name] ?? Object.entries(ui.data.genus ?? {}).find(([n]) => n.toLowerCase() === open!.name.toLowerCase())?.[1] ?? null : null);
</script>

<form class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" onsubmit={(e) => { e.preventDefault(); void search(); }}>
  <label class="flex items-center gap-1.5 text-muted-foreground">Name <Input class="w-52" bind:value={name} placeholder="Character name" aria-label="Character name" autocomplete="off" required /></label>
  <label class="flex items-center gap-1.5 text-muted-foreground">Region <NativeSelect bind:value={region}>{#each Object.values(REGIONS) as r}<NativeSelectOption value={r}>{REGION_NAMES[r] ?? r}</NativeSelectOption>{/each}</NativeSelect></label>
  <label class="flex items-center gap-1.5 text-muted-foreground">Server <NativeSelect bind:value={serverId}>
    {#each ["Elyos", "Asmodian"] as side, k}<optgroup label={side}>{#each servers.filter((s) => Math.floor(s.id / 1000) === k + 1) as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</optgroup>{/each}
  </NativeSelect></label>
  <Button type="submit" disabled={searching} onclick={() => { touched = true; }}>{searching ? "Searching…" : "Search"}</Button>
  {#if me && !(open && open.serverId === me.serverId && open.name.toLowerCase() === me.name.toLowerCase())}
    <Button type="button" variant="ghost" title="Back to the character you play in game" onclick={openMe}>← My character ({me.name})</Button>{/if}
</form>
<p class="hint mt-0 mb-3">From the official character search: names containing what you type, on one server. Only Europe has been checked.</p>
{#if error}<p class="hint error">The search could not be read ({error}).</p>{/if}

{#if found}<Panel title="Characters" count={found.length}>
  <Table.Root>
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Name</Table.Head><Table.Head class="text-right">Level</Table.Head><Table.Head>Server</Table.Head></Table.Row></Table.Header>
    <Table.Body>{#each found as c (c.characterId)}<Table.Row data-state={open === c ? "selected" : undefined}>
      <Table.Cell><Button variant="link" size="sm" class="px-0" onclick={() => show(c)}>{c.name}</Button></Table.Cell><Table.Cell class="text-right">{c.level ?? "—"}</Table.Cell><Table.Cell>{c.serverName}</Table.Cell>
    </Table.Row>{:else}<Table.Row><Table.Cell class="text-muted-foreground" colspan={3}>No character with that name on this server.</Table.Cell></Table.Row>{/each}</Table.Body>
  </Table.Root>
</Panel>{/if}

{#if open}<Panel count="{profile?.className ?? ''} · {open.serverName}">
  {#snippet head()}<span class="flex items-center gap-2">{#if profile && classIcon(profile.className)}<img class="size-6 object-contain" src={classIcon(profile.className)} alt="">{/if}{open!.name}</span>{/snippet}
  {#if loading}<p class="hint mt-0">Reading the profile…</p>
  {:else if profileError}<p class="hint error mt-0">The profile could not be read ({profileError}).</p>
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
