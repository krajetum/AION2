<script lang="ts">
  // The roster: role, gear (shared, else the official profile), last seen; Remove for whoever may, on lower roles only.
  import { untrack } from "svelte";
  import { adminGuild } from "../../../app/guild.ts";
  import { can, myRole, ONLINE_MS, rank, ROLE_LABEL, rosterRows, type GuildLink, type GuildView } from "../../../domain/guild.ts";
  import { classColor, short } from "../../../domain/meter.ts";
  import { officialProfile } from "../../../infra/armory.ts";
  import { isDesktop } from "../../../infra/system.ts";
  import { refreshGuild } from "../../actions.ts";
  import { classIcon } from "../../classes.ts";
  import { num } from "../../format.ts";
  import { ui } from "../../state.svelte.ts";
  import { gs, run } from "./run.svelte.ts";

  let { g, view }: { g: GuildLink; view: GuildView } = $props();

  // Gear: what members shared, else their official profile (desktop app only: the site sends no CORS headers).
  let official = $state<Record<string, { itemLevel: number | null; combatPower: number | null } | null>>({});
  $effect(() => {
    const v = view;
    if (!isDesktop()) return;
    untrack(() => {
      for (const m of v.members) {
        if (m.itemLevel !== null || m.name in official) continue;
        official[m.name] = null;
        officialProfile(m.name, v.serverId).then((p) => { if (p) official[m.name] = { itemLevel: p.itemLevel, combatPower: p.combatPower }; }).catch(() => {});
      }
    });
  });
  const roster = $derived(rosterRows(view.members, official));
  const roleOf = $derived(new Map(view.members.map((m) => [m.name, m.role])));
  const me = $derived(myRole(view, g));
  const mayRemove = (name: string) => can(view, g, "manage.members") && !view.members.find((m) => m.name === name)?.me
    && (me === "leader" || rank(roleOf.get(name) ?? "member") < rank(me));
  const remove = (name: string) => {
    if (confirm(`Remove ${name} from the guild? Get a new invite code too, or they can join again.`))
      run(() => adminGuild(ui.data, { remove: name }).then(() => refreshGuild(false)), `${name} removed`);
  };
  const openPlayer = (name: string) => { ui.lookup = { name, serverId: g.serverId }; ui.tab = "players"; history.replaceState(null, "", "#players"); };
  const ago = (t: number) => { const m = Math.max(0, Math.round((ui.now - t) / 60_000)); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };
</script>

<section><h2>Members <span class="count">{view.memberCount}</span></h2>
  <div class="scroll"><table class="sheet">
    <thead><tr><th>Name</th><th>Role</th><th class="n">Item level</th><th class="n">CP</th><th>Seen</th><th></th></tr></thead>
    <tbody>{#each roster as m (m.name)}{@const role = roleOf.get(m.name) ?? "member"}<tr style:--cls={classColor(m.className) || null}>
      <td>{#if classIcon(m.className)}<img class="cls-icon" src={classIcon(m.className)} alt={m.className} title={m.className} width="22" height="23">{/if}
        <button class="ghost" title="Profile, gear and best-in-slot check" onclick={() => openPlayer(m.name)}>{m.name}</button>{#if m.className}<small>{m.className}</small>{/if}</td>
      <td><span class="role {role}">{ROLE_LABEL[role]}</span></td>
      <td class="n">{m.itemLevel == null ? "—" : num(m.itemLevel)}{#if m.official}<small class="dim" title="From the official profile"> official</small>{/if}</td>
      <td class="n">{m.combatPower == null ? "—" : short(m.combatPower)}</td>
      <td>{ui.now - m.seenMs < ONLINE_MS ? "Online" : ago(m.seenMs)}</td>
      <td>{#if mayRemove(m.name)}<button class="ghost" disabled={gs.busy} onclick={() => remove(m.name)}>Remove</button>{/if}</td>
    </tr>{/each}</tbody></table></div>
  <p class="hint">Click a member for their whole profile and which best-in-slot lines each piece has.{#if !isDesktop()} Official profiles are read in the desktop app only.{/if}</p>
</section>

<style>
  .role { font-size: 12px; padding: 1px 8px; border-radius: var(--r-pill); color: var(--muted); background: var(--raised); }
  .role.leader { color: var(--gold-ink); background: var(--gold-bg); }
  .role.officer { color: var(--primary-ink); background: var(--primary-fill); }
</style>
