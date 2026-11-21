<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { NativeSelect, NativeSelectOption } from "$lib/components/ui/native-select/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
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
  import RaidPlan from "./guild/RaidPlan.svelte";
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
  const me = $derived<GuildMe | null>(profile ? meCard(profile) : charName.trim() ? { name: charName.trim(), className: "", itemLevel: null, combatPower: null, serverId: serverId || null } : null);
  const create = () => run(() => createGuild(ui.data, guildName.trim(), profile?.serverId ?? serverId, me!).then(() => refreshGuild(false)), "Static created");
  const join = () => run(() => joinGuild(ui.data, code, me!).then(() => refreshGuild(false)), "Joined the static");

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
      ["Static", [{ id: "overview", label: "Overview" }, { id: "callups", label: "Call-ups", need: "view.callups", count: view.callups.length },
        { id: "raidplan", label: "Raid plan", need: "view.raidplan" },
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
  <p class="hint mt-0 mb-3">A static shares field-boss alerts (in your Discord channel), planned raids, the members' gear and the boss fights they choose to share.
    One member creates it and gets an invite code for the others, plus a leader key. No account needed.</p>
  {#if profile}<p class="hint mb-3">You'll appear as <b>{profile.name}</b> ({serverName(profile.serverId) || `server ${profile.serverId}`}), as the meter sees you.</p>
  {:else}<div class="mb-2 flex flex-wrap items-center gap-2 text-sm"><label class="flex items-center gap-1.5 text-muted-foreground">Your character <Input class="w-48" bind:value={charName} placeholder="Character name" autocomplete="off" /></label>
      <NativeSelect bind:value={region} aria-label="Region">{#each Object.values(REGIONS) as r}<NativeSelectOption value={r}>{r.toUpperCase()}</NativeSelectOption>{/each}</NativeSelect>
      <NativeSelect bind:value={serverId} aria-label="Your server">{#each servers as s (s.id)}<NativeSelectOption value={s.id}>{s.name}</NativeSelectOption>{/each}</NativeSelect></div>
    <p class="hint mb-3">Or start the game with the companion open: the meter fills in your character, item level and CP.</p>{/if}
  <div class="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
    <Panel title="Join a static" class="mb-0">
      <form class="flex flex-wrap gap-2" onsubmit={(e) => { e.preventDefault(); join(); }}>
        <Input class="min-w-0 flex-1" bind:value={code} placeholder="Invite code (XXXX-XXXX-XXXX-XXXX)" aria-label="Invite code" autocomplete="off" required />
        <Button type="submit" disabled={gs.busy || !me}>Join</Button></form></Panel>
    <Panel title="Create a static" class="mb-0">
      <form class="flex flex-wrap items-center gap-2" onsubmit={(e) => { e.preventDefault(); create(); }}>
        <Input class="min-w-0 flex-1" bind:value={guildName} placeholder="Static name" aria-label="Static name" maxlength={32} autocomplete="off" required />
        {#if !profile}<span class="text-xs text-muted-foreground">on {serverName(serverId) || "your server"}</span>{/if}
        <Button type="submit" disabled={gs.busy || !me}>Create</Button></form></Panel>
  </div>
  {#if gs.error}<p class="hint error">{gs.error}</p>{/if}
{:else}
  <div class="mb-3 flex flex-wrap items-baseline gap-3">
    <h2 class="m-0 text-lg font-semibold">{g.name}</h2>
    <span class="text-sm text-muted-foreground">{serverName(g.serverId) || `server ${g.serverId}`} · {view ? `${view.memberCount} member${view.memberCount === 1 ? "" : "s"}` : "…"}</span>
    {#if g.memberCode && view && can(view, g, "manage.invite")}<Button variant="outline" size="sm" class="ml-auto" title="Invite code: give it to new members" onclick={() => copy(pretty(g.memberCode!))}>Copy invite code</Button>{/if}
  </div>
  {#if gs.error}<p class="hint error">{gs.error}</p>{/if}
  {#if !view}<p class="hint">Reading the static…</p>
  {:else}<div class="guild">
    <nav class="guild-menu" aria-label="Static sections">
      {#each groups as [name, items] (name)}{#if name}<span class="px-2 pt-2 pb-1 text-xs font-semibold tracking-wider text-faint-foreground uppercase first:pt-0.5">{name}</span>{:else}<hr class="my-2 w-full border-0 border-t">{/if}
        {#each items as i (i.id)}<button class="tab" aria-current={i.id === section ? "page" : undefined} onclick={() => go(i.id)}>
          <span class="lbl">{i.label}</span>{#if i.count}<span class="count">{i.count}</span>{/if}</button>{/each}{/each}
    </nav>
    <div class="min-w-0">
      {#if section === "callups"}<Callups {g} {view} {go} />{:else if section === "raidplan"}<RaidPlan {g} {view} />{:else if section === "members"}<Members {g} {view} />{:else if section === "fights"}<svelte:boundary onerror={(e) => console.error("Static fights failed", e)}><Fights {g} {view} />
        {#snippet failed(e, reset)}<Panel title="Shared fights"><p class="hint error mt-0">This section failed to show: {e instanceof Error ? e.message : String(e)}</p>
          <Button class="mt-2" variant="outline" size="sm" onclick={reset}>Try again</Button></Panel>{/snippet}</svelte:boundary>
      {:else if section === "discord"}<Discord {view} />{:else if section === "invite"}<Invite {g} />{:else if section === "roles"}<Roles {view} />
      {:else if section === "mine"}<Mine {g} {view} />{:else}<Overview {g} {view} {go} />{/if}
    </div>
  </div>{/if}
{/if}

<style>
  .guild { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: var(--gap); align-items: start; }
  .guild-menu { position: sticky; top: 64px; display: flex; flex-direction: column; gap: 2px; padding: 8px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); }
  /* Narrow: the menu becomes a row of sections above the page. */
  @media (max-width: 760px) {
    .guild { grid-template-columns: minmax(0, 1fr); }
    .guild-menu { position: static; flex-direction: row; overflow-x: auto; }
    .guild-menu span, .guild-menu hr { display: none; }
    .guild-menu .tab { width: auto; flex: none; }
  }
</style>
