<script lang="ts">
  import { NativeSelect, NativeSelectOption } from "$lib/components/ui/native-select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
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

<Panel title="Roles">
  <Table.Root>
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Member</Table.Head><Table.Head>Role</Table.Head></Table.Row></Table.Header>
    <Table.Body>{#each view.members as m (m.name)}<Table.Row><Table.Cell><span class="font-medium">{m.name}</span>{#if m.me} <span class="text-xs text-muted-foreground">you</span>{/if}</Table.Cell>
      <Table.Cell><NativeSelect size="sm" value={m.role} disabled={gs.busy} aria-label="Role of {m.name}" onchange={(e) => setRole(m.name, e.currentTarget.value as Role, m.me, e.currentTarget)}>
        {#each ROLES as r}<NativeSelectOption value={r}>{ROLE_LABEL[r]}</NativeSelectOption>{/each}</NativeSelect></Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
  <p class="hint">Leaders can do everything, including this page. Officers do what the table below lets them. A static always keeps one Leader.</p>
</Panel>

{#snippet rows(list: readonly Perm[])}{#each list as p (p)}<Table.Row><Table.Cell class="whitespace-normal">{PERM_LABEL[p]}</Table.Cell>
  <Table.Cell><NativeSelect size="sm" value={view.perms[p]} disabled={gs.busy} aria-label="Who may: {PERM_LABEL[p]}"
    onchange={(e) => admin({ perms: { [p]: e.currentTarget.value as Role } }, "Permissions saved")}>
    {#each ROLES as r}<NativeSelectOption value={r}>{WHO[r]}</NativeSelectOption>{/each}</NativeSelect></Table.Cell></Table.Row>{/each}{/snippet}
<Panel title="Permissions">
  <Table.Root>
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>See</Table.Head><Table.Head>Who</Table.Head></Table.Row></Table.Header><Table.Body>{@render rows(VIEW)}</Table.Body>
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Manage</Table.Head><Table.Head>Who</Table.Head></Table.Row></Table.Header><Table.Body>{@render rows(MANAGE)}</Table.Body>
  </Table.Root>
  <p class="hint">What a role can't see isn't sent to its members' apps at all. Field-boss timers are always shown: they come from every player, not the static.</p>
</Panel>
