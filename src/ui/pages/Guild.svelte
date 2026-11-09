<script lang="ts">
  // Guild page: create or join with a code; in a guild, a side menu of sections (pages/guild/*), each shown only to
  // the roles the guild allows (domain/guild.ts `can`): what members see, what Officers and Leaders manage, your own settings.
  import { createGuild, joinGuild } from "../../app/guild.ts";
  import { can, meCard, myRole, type GuildMe, type Perm } from "../../domain/guild.ts";
  import { REGIONS, regionOf, serverName, serversIn } from "../../domain/servers.ts";
  import { untrack } from "svelte";
  import { refreshGuild } from "../actions.ts";
  import { ui } from "../state.svelte.ts";
  import Callups from "./guild/Callups.svelte";
  import Discord from "./guild/Discord.svelte";
  import Fights from "./guild/Fights.svelte";
  import Invite from "./guild/Invite.svelte";
  import Members from "./guild/Members.svelte";
  import Mine from "./guild/Mine.svelte";
  import Overview from "./guild/Overview.svelte";
  import Roles from "./guild/Roles.svelte";
  import { copy, gs, pretty, run } from "./guild/run.svelte.ts";

  const g = $derived(ui.data.guild);
  const view = $derived(ui.guild && ui.guild.id === g?.id ? ui.guild : null);
  const profile = $derived(ui.meter?.profile && !ui.meter.demo ? ui.meter.profile : null);

  // ---- No guild yet: create or join ----
  let guildName = $state(""), code = $state(""), charName = $state("");
  let region = $state(regionOf(ui.data.serverId ?? 0) || "eu");
  let serverId = $state(ui.data.serverId ?? 0);
  const servers = $derived(serversIn(region));
  $effect(() => { if (!servers.some((s) => s.id === serverId)) serverId = servers[0]?.id ?? 0; });
  /** Your card: the character the meter sees, else the name typed in (no gear numbers then). */
  const me = $derived<GuildMe | null>(profile ? meCard(profile) : charName.trim() ? { name: charName.trim(), className: "", itemLevel: null, combatPower: null } : null);
  const create = () => run(() => createGuild(ui.data, guildName.trim(), profile?.serverId ?? serverId, me!).then(() => refreshGuild(false)), "Guild created");
  const join = () => run(() => joinGuild(ui.data, code, me!).then(() => refreshGuild(false)), "Joined the guild");

  // ---- In a guild ----
  // untrack: refreshGuild reads the meter, which updates 5 times a second.
  const guildId = $derived(g?.id);
  $effect(() => { if (guildId) untrack(() => void refreshGuild(false)); });

  /** Menu entries: `need` = a permission, or "leader". Hidden when you lack it. */
  type Item = { id: string; label: string; need?: Perm | "leader"; count?: number };
  const groups = $derived.by((): [string, Item[]][] => {
    if (!view) return [];
    const allowed = (i: Item) => !i.need || (i.need === "leader" ? myRole(view, g) === "leader" : can(view, g, i.need));
    const all: [string, Item[]][] = [
      ["Guild", [{ id: "overview", label: "Overview" }, { id: "callups", label: "Call-ups", need: "view.callups", count: view.callups.length },
        { id: "members", label: "Members", need: "view.members", count: view.memberCount }, { id: "fights", label: "Fights", need: "view.fights" }]],
      ["Manage", [{ id: "discord", label: "Discord", need: "manage.discord" }, { id: "invite", label: "Invite", need: "manage.invite" },
        { id: "roles", label: "Roles & permissions", need: "leader" }]],
      ["", [{ id: "mine", label: "My settings" }]],
    ];
    return all.map(([n, items]): [string, Item[]] => [n, items.filter(allowed)]).filter(([, items]) => items.length);
  });

  // The open section, remembered (this browser only); one you may no longer open falls back to Overview.
  const KEY = "aion2-guild-section";
  let picked = $state((() => { try { return localStorage.getItem(KEY) ?? "overview"; } catch { return "overview"; } })());
  const section = $derived(groups.some(([, items]) => items.some((i) => i.id === picked)) ? picked : "overview");
  function go(id: string) {
    picked = id;
    try { localStorage.setItem(KEY, id); } catch { /* not kept */ }
    void refreshGuild(false); // each section as the Worker has it now
  }
</script>

{#if !g}
  <p class="hint intro">A guild shares field-boss alerts (in your Discord channel), planned raids, the members' gear and the boss fights they choose to share.
    One member creates it and gets an invite code for the others, plus a leader key. No account needed.</p>
  {#if profile}<p class="hint">You'll appear as <b>{profile.name}</b> ({serverName(profile.serverId) || `server ${profile.serverId}`}), as the meter sees you.</p>
  {:else}<label class="toolbar start">Your character <input bind:value={charName} placeholder="Character name" autocomplete="off"></label>
    <p class="hint">Or start the game with the companion open: the meter fills in your character, item level and CP.</p>{/if}
  <div class="cards">
    <section class="dps-table"><h2>Join a guild</h2>
      <form class="toolbar start" onsubmit={(e) => { e.preventDefault(); join(); }}>
        <input bind:value={code} placeholder="Invite code (XXXX-XXXX-XXXX-XXXX)" aria-label="Invite code" autocomplete="off" required>
        <button disabled={gs.busy || !me}>Join</button></form></section>
    <section class="dps-table"><h2>Create a guild</h2>
      <form class="toolbar start" onsubmit={(e) => { e.preventDefault(); create(); }}>
        <input bind:value={guildName} placeholder="Guild or static name" aria-label="Guild name" maxlength="32" autocomplete="off" required>
        {#if !profile}<select bind:value={region} aria-label="Region">{#each Object.values(REGIONS) as r}<option value={r}>{r.toUpperCase()}</option>{/each}</select>
          <select bind:value={serverId} aria-label="Server">{#each servers as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select>{/if}
        <button disabled={gs.busy || !me}>Create</button></form></section>
  </div>
  {#if gs.error}<p class="hint">{gs.error}</p>{/if}
{:else}
  <div class="toolbar start guild-head">
    <h2>{g.name} <span class="count">{serverName(g.serverId) || `server ${g.serverId}`} · {view ? `${view.memberCount} member${view.memberCount === 1 ? "" : "s"}` : "…"}</span></h2>
    {#if g.memberCode && view && can(view, g, "manage.invite")}<button class="ghost" title="Invite code: give it to new members" onclick={() => copy(pretty(g.memberCode!))}>Copy invite code</button>{/if}
  </div>
  {#if gs.error}<p class="hint">{gs.error}</p>{/if}
  {#if !view}<p class="hint">Reading the guild…</p>
  {:else}<div class="guild">
    <nav class="guild-menu" aria-label="Guild sections">
      {#each groups as [name, items] (name)}{#if name}<span class="label">{name}</span>{:else}<hr>{/if}
        {#each items as i (i.id)}<button class="tab" aria-current={i.id === section ? "page" : undefined} onclick={() => go(i.id)}>
          <span class="lbl">{i.label}</span>{#if i.count}<span class="count">{i.count}</span>{/if}</button>{/each}{/each}
    </nav>
    <div class="guild-section">
      {#if section === "callups"}<Callups {g} {view} {go} />{:else if section === "members"}<Members {g} {view} />{:else if section === "fights"}<Fights />
      {:else if section === "discord"}<Discord {view} />{:else if section === "invite"}<Invite {g} />{:else if section === "roles"}<Roles {view} />
      {:else if section === "mine"}<Mine {g} {view} />{:else}<Overview {g} {view} {go} />{/if}
    </div>
  </div>{/if}
{/if}

<style>
  .cards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .guild-head h2 { margin: 0; }
  .guild { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: var(--gap); align-items: start; }
  .guild-menu { position: sticky; top: 8px; display: flex; flex-direction: column; gap: 2px; padding: 8px; background: var(--surface); border-radius: var(--r-card); }
  .guild-menu .label { padding: 8px 10px 4px; }
  .guild-menu .label:first-child { padding-top: 2px; }
  .guild-menu hr { width: 100%; margin: 8px 0; border: 0; border-top: 1px solid var(--rule); }
  .guild-menu .tab { padding-left: 14px; }
  .guild-menu .tab[aria-current="page"]::before { left: 4px; }
  .guild-section { min-width: 0; }
  /* Narrow: the menu becomes a row of sections above the page. */
  @media (max-width: 760px) {
    .guild { grid-template-columns: minmax(0, 1fr); }
    .guild-menu { position: static; flex-direction: row; overflow-x: auto; }
    .guild-menu .label, .guild-menu hr { display: none; }
    .guild-menu .tab { width: auto; flex: none; }
  }
</style>
