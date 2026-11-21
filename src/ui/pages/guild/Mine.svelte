<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  // Your own settings in the guild: what you share, the leader key, leaving.
  import { leaveGuild, setOfficerKey, setShare } from "../../../app/guild.ts";
  import { ROLE_LABEL, myRole, type GuildLink, type GuildView } from "../../../domain/guild.ts";
  import { refreshGuild } from "../../actions.ts";
  import { ui } from "../../state.svelte.ts";
  import { copy, gs, pretty, run } from "./run.svelte.ts";

  let { g, view }: { g: GuildLink; view: GuildView } = $props();
  let keyInput = $state("");
  const share = (k: "gear" | "fights", on: boolean) => run(() => setShare(ui.data, { ...g.share, [k]: on }).then(() => refreshGuild(false)));
  const leave = () => { if (confirm(`Leave ${g.name}? Your card and shared fights are deleted from the static.`)) run(async () => { await leaveGuild(ui.data); ui.guild = null; }, "Left the static"); };
  const useKey = () => { const k = keyInput; keyInput = ""; void run(async () => { setOfficerKey(ui.data, k); await refreshGuild(false); }, "Leader key saved"); };
</script>

<Panel title="What I share">
  <div class="flex flex-col gap-2.5 text-sm">
    <label class="flex cursor-pointer items-center gap-2.5"><Checkbox checked={g.share.gear} disabled={gs.busy} onCheckedChange={(on) => share("gear", on)} /> My item level and CP</label>
    <label class="flex cursor-pointer items-center gap-2.5"><Checkbox checked={g.share.fights} disabled={gs.busy} onCheckedChange={(on) => share("fights", on)} /> My boss fights (DPS and skills)</label>
  </div>
  <p class="hint">Your role: <b>{ROLE_LABEL[myRole(view, g)]}</b>.</p>
</Panel>

<Panel title="Leader key">
  {#if g.officerKey}
    <Button variant="outline" size="sm" onclick={() => copy(pretty(g.officerKey!))}>Copy leader key</Button>
    <p class="hint">Whoever has it is a Leader: give it only to someone who should be. Leaders can also make members Leaders from Roles, no key needed.</p>
  {:else}
    <form class="flex flex-wrap gap-2" onsubmit={(e) => { e.preventDefault(); useKey(); }}>
      <Input class="max-w-80 flex-1" bind:value={keyInput} placeholder="Leader key" aria-label="Leader key" autocomplete="off" required /><Button type="submit" variant="outline" disabled={gs.busy}>Use</Button></form>
    <p class="hint">The key was shown to whoever created the static (before roles it was called the officer key). It makes you a Leader.</p>
  {/if}
</Panel>

<Panel title="Leave the static">
  <Button variant="destructive" size="sm" disabled={gs.busy} onclick={leave}>Leave {g.name}</Button>
  <p class="hint">Your card and shared fights are deleted from the static.</p>
</Panel>
