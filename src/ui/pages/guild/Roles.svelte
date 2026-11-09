<script lang="ts">
  // Leaders: each member's role, and which roles may see or do each thing in the guild.
  import { adminGuild, type AdminAction } from "../../../app/guild.ts";
  import { PERM_LABEL, PERMS, ROLE_LABEL, ROLES, type GuildView, type Perm, type Role } from "../../../domain/guild.ts";
  import { refreshGuild } from "../../actions.ts";
  import { ui } from "../../state.svelte.ts";
  import { gs, run } from "./run.svelte.ts";

  let { view }: { view: GuildView } = $props();
  const admin = (a: AdminAction, done: string) => run(() => adminGuild(ui.data, a).then(() => refreshGuild(false)), done);
  const WHO: Record<Role, string> = { member: "Everyone", officer: "Officers and Leaders", leader: "Leaders only" };
  const VIEW = PERMS.filter((p) => p.startsWith("view."));
  const MANAGE = PERMS.filter((p) => p.startsWith("manage."));
  const leaders = $derived(view.members.filter((m) => m.role === "leader").length);

  function setRole(name: string, role: Role, self: boolean, el: HTMLSelectElement) {
    if (self && role !== "leader" && !confirm(leaders > 1 ? "Give up your Leader role? Another Leader can give it back."
      : "You are the only Leader: the longest-standing Officer becomes Leader. Go on?")) { el.value = "leader"; return; }
    admin({ setRole: { name, role } }, `${name}: ${ROLE_LABEL[role]}`);
  }
</script>

<section><h2>Roles</h2>
  <div class="scroll"><table class="sheet">
    <thead><tr><th>Member</th><th>Role</th></tr></thead>
    <tbody>{#each view.members as m (m.name)}<tr><td><span class="name">{m.name}</span>{#if m.me} <small class="dim">you</small>{/if}</td>
      <td><select value={m.role} disabled={gs.busy} aria-label="Role of {m.name}" onchange={(e) => setRole(m.name, e.currentTarget.value as Role, m.me, e.currentTarget)}>
        {#each ROLES as r}<option value={r}>{ROLE_LABEL[r]}</option>{/each}</select></td></tr>{/each}</tbody></table></div>
  <p class="hint">Leaders can do everything, including this page. Officers do what the table below lets them. A guild always keeps one Leader.</p>
</section>

<section><h2>Permissions</h2>
  {#snippet rows(list: readonly Perm[])}{#each list as p (p)}<tr><td>{PERM_LABEL[p]}</td>
    <td><select value={view.perms[p]} disabled={gs.busy} aria-label="Who may: {PERM_LABEL[p]}"
      onchange={(e) => admin({ perms: { [p]: e.currentTarget.value as Role } }, "Permissions saved")}>
      {#each ROLES as r}<option value={r}>{WHO[r]}</option>{/each}</select></td></tr>{/each}{/snippet}
  <div class="scroll"><table class="sheet">
    <thead><tr><th>See</th><th>Who</th></tr></thead><tbody>{@render rows(VIEW)}</tbody>
    <thead><tr><th>Manage</th><th>Who</th></tr></thead><tbody>{@render rows(MANAGE)}</tbody>
  </table></div>
  <p class="hint">What a role can't see isn't sent to its members' apps at all. Field-boss timers are always shown: they come from every player, not the guild.</p>
</section>
