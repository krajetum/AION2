<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  // The roster: role, gear (shared, else the official profile), last seen; Remove for whoever may, on lower roles only.
  import { untrack } from "svelte";
  import { adminGuild } from "../../../app/guild.ts";
  import { can, myRole, ONLINE_MS, rank, ROLE_LABEL, rosterRows, type GuildLink, type GuildView } from "../../../domain/guild.ts";
  import { classColor, short } from "../../../domain/meter.ts";
  import { officialProfile } from "../../../infra/armory.ts";
  import { serverName } from "../../../domain/servers.ts";
  import { isDesktop } from "../../../infra/system.ts";
  import { refreshGuild } from "../../actions.ts";
  import { classIcon } from "../../classes.ts";
  import { num } from "../../format.ts";
  import { ui } from "../../state.svelte.ts";
  import { gs, run } from "./run.svelte.ts";

  let { g, view }: { g: GuildLink; view: GuildView } = $props();

  // Gear: what members shared, else their official profile (desktop app only: the site sends no CORS headers).
  let official = $state<Record<string, { itemLevel: number | null; combatPower: number | null; className: string } | null>>({});
  $effect(() => {
    const v = view;
    if (!isDesktop()) return;
    untrack(() => {
      for (const m of v.members) {
        if ((m.itemLevel !== null && m.className) || m.name in official) continue;
        official[m.name] = null;
        // On the member's own server; a card from before servers were kept: the guild's (a guess).
        officialProfile(m.name, m.serverId ?? v.serverId).then((p) => {
          if (p) official[m.name] = { itemLevel: p.itemLevel, combatPower: p.combatPower, className: p.className };
        }).catch(() => {});
      }
    });
  });
  const roster = $derived(rosterRows(view.members, official));
  const roleOf = $derived(new Map(view.members.map((m) => [m.name, m.role])));
  const me = $derived(myRole(view, g));
  const mayRemove = (name: string) => can(view, g, "manage.members") && !view.members.find((m) => m.name === name)?.me
    && (me === "leader" || rank(roleOf.get(name) ?? "member") < rank(me));
  const remove = (name: string) => {
    if (confirm(`Remove ${name} from the static? Get a new invite code too, or they can join again.`))
      run(() => adminGuild(ui.data, { remove: name }).then(() => refreshGuild(false)), `${name} removed`);
  };
  const openPlayer = (name: string) => { ui.lookup = { name, serverId: view.members.find((m) => m.name === name)?.serverId ?? g.serverId }; ui.tab = "players"; history.replaceState(null, "", "#players"); };
  const ago = (t: number) => { const m = Math.max(0, Math.round((ui.now - t) / 60_000)); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };
</script>

<Panel title="Members" count={view.memberCount}>
  <Table.Root>
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Name</Table.Head><Table.Head>Role</Table.Head><Table.Head class="text-right">Item level</Table.Head><Table.Head class="text-right">CP</Table.Head><Table.Head>Seen</Table.Head><Table.Head></Table.Head></Table.Row></Table.Header>
    <Table.Body>{#each roster as m (m.name)}{@const role = roleOf.get(m.name) ?? "member"}<Table.Row>
      <Table.Cell><span class="flex flex-wrap items-center gap-2">{#if classIcon(m.className)}<img class="size-5 object-contain" src={classIcon(m.className)} alt={m.className} title={m.className}>{/if}
        <Button variant="link" size="sm" class="h-auto px-0 text-foreground" title="Profile, gear and best-in-slot check" onclick={() => openPlayer(m.name)}>{m.name}</Button>{#if m.className}<span class="text-xs text-muted-foreground">{m.className}</span>{/if}{#if m.serverId && m.serverId !== g.serverId}<span class="text-xs text-muted-foreground" title="Plays on another server">{serverName(m.serverId) || `server ${m.serverId}`}</span>{/if}</span></Table.Cell>
      <Table.Cell><Badge variant="secondary" class={role === "leader" ? "text-gold" : role === "officer" ? "text-primary" : "text-muted-foreground"}>{ROLE_LABEL[role]}</Badge></Table.Cell>
      <Table.Cell class="text-right">{m.itemLevel == null ? "—" : num(m.itemLevel)}{#if m.official}<span class="text-xs text-muted-foreground" title="From the official profile"> official</span>{/if}</Table.Cell>
      <Table.Cell class="text-right">{m.combatPower == null ? "—" : short(m.combatPower)}</Table.Cell>
      <Table.Cell class={ui.now - m.seenMs < ONLINE_MS ? "text-hps" : "text-muted-foreground"}>{ui.now - m.seenMs < ONLINE_MS ? "Online" : ago(m.seenMs)}</Table.Cell>
      <Table.Cell class="text-right">{#if mayRemove(m.name)}<Button variant="ghost" size="sm" disabled={gs.busy} onclick={() => remove(m.name)}>Remove</Button>{/if}</Table.Cell>
    </Table.Row>{/each}</Table.Body></Table.Root>
  <p class="hint">Click a member for their whole profile and which best-in-slot lines each piece has.{#if !isDesktop()} Official profiles are read in the desktop app only.{/if}</p>
</Panel>
