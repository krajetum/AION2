<script lang="ts">
  // Player search: the official character search and profiles (infra/armory.ts), as on NCSOFT's site.
  import { profilePage, type Found, type Profile } from "../../domain/armory.ts";
  import { gearUrl, REGIONS, regionOf, serversIn } from "../../domain/servers.ts";
  import { profileOf, searchPlayers } from "../../infra/armory.ts";
  import { classIcon } from "../classes.ts";
  import { hm, num } from "../format.ts";
  import Equipment from "../parts/Equipment.svelte";
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
    try {
      const p = await profileOf(c.characterId, c.serverId);
      if (open === c) { profile = p; if (!p) profileError = "the site sent no profile"; }
    } catch (e) { if (open === c) profileError = e instanceof Error ? e.message : String(e); }
    if (open === c) loading = false;
  }
  if (asked) { ui.lookup = null; void search(); }
</script>

<form class="toolbar start" onsubmit={(e) => { e.preventDefault(); void search(); }}>
  <label>Name <input bind:value={name} placeholder="Character name" aria-label="Character name" autocomplete="off" required></label>
  <label>Region <select bind:value={region}>{#each Object.values(REGIONS) as r}<option value={r}>{REGION_NAMES[r] ?? r}</option>{/each}</select></label>
  <label>Server <select bind:value={serverId}>
    {#each ["Elyos", "Asmodian"] as side, k}<optgroup label={side}>{#each servers.filter((s) => Math.floor(s.id / 1000) === k + 1) as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</optgroup>{/each}
  </select></label>
  <button disabled={searching}>{searching ? "Searching…" : "Search"}</button>
</form>
<p class="hint">From the official character search: names containing what you type, on one server. Only Europe has been checked.</p>
{#if error}<p class="hint">The search could not be read ({error}).</p>{/if}

{#if found}<section class="dps-table"><h2>Characters <span class="count">{found.length}</span></h2>
  <div class="scroll"><table class="sheet">
    <thead><tr><th>Name</th><th class="n">Level</th><th>Server</th></tr></thead>
    <tbody>{#each found as c (c.characterId)}<tr class:on={open === c}>
      <td><button class="ghost" onclick={() => show(c)}>{c.name}</button></td><td class="n">{c.level ?? "—"}</td><td>{c.serverName}</td>
    </tr>{:else}<tr><td class="hint" colspan="3">No character with that name on this server.</td></tr>{/each}</tbody>
  </table></div>
</section>{/if}

{#if open}<section class="dps-table"><h2>{#if profile && classIcon(profile.className)}<img class="cls-icon" src={classIcon(profile.className)} alt="" width="22" height="23">{/if}{open.name}
  <span class="count">{profile?.className ?? ""} · {open.serverName}</span></h2>
  {#if loading}<p class="hint">Reading the profile…</p>
  {:else if profileError}<p class="hint">The profile could not be read ({profileError}).</p>
  {:else if profile}
    <div class="kpis">
      <Kpi label="Combat power" value={profile.combatPower == null ? "—" : num(profile.combatPower)} cls="hero" sub={profile.title || " "} />
      <Kpi label="Item level" value={profile.itemLevel == null ? "—" : num(profile.itemLevel)} sub={profile.raceName || " "} />
      <Kpi label="Level" value={profile.level == null ? "—" : String(profile.level)} sub="read {hm(profile.atMs)}" />
    </div>
    <Equipment characterId={open.characterId} serverId={open.serverId} />
    <h3>Stats</h3>
    {#if profile.stats?.length}<div class="scroll"><table class="sheet">
      <thead><tr><th>Stat</th><th class="n">Value</th><th>Gives</th></tr></thead>
      <tbody>{#each profile.stats as s (s.name)}<tr><td>{s.name}</td><td class="n">{num(s.value)}</td><td class="dim">{s.effects.join(" · ")}</td></tr>{/each}</tbody>
    </table></div>{/if}
    {#if profile.boards?.length}<h3>Daevanion</h3><div class="kpis">
      {#each profile.boards as b (b.name)}<div class="kpi"><small>{b.name}</small><b>{b.open} / {b.total}</b>
        <div class="bar"><i style:--p={String(b.total ? b.open / b.total : 0)}></i></div></div>{/each}</div>{/if}
  {/if}
  <p><a href={profilePage(open.characterId, open.serverId)} target="_blank" rel="noopener">Official profile ↗</a>
    {#if gearUrl(open.name, open.serverId)} · <a href={gearUrl(open.name, open.serverId)} target="_blank" rel="noopener">shugo.gg ↗</a>{/if}</p>
</section>{/if}
