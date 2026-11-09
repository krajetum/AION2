<script lang="ts">
  // Your own settings in the guild: what you share, the leader key, leaving.
  import { leaveGuild, setOfficerKey, setShare } from "../../../app/guild.ts";
  import { ROLE_LABEL, myRole, type GuildLink, type GuildView } from "../../../domain/guild.ts";
  import { refreshGuild } from "../../actions.ts";
  import { ui } from "../../state.svelte.ts";
  import { copy, gs, pretty, run } from "./run.svelte.ts";

  let { g, view }: { g: GuildLink; view: GuildView } = $props();
  let keyInput = $state("");
  const share = (k: "gear" | "fights", on: boolean) => run(() => setShare(ui.data, { ...g.share, [k]: on }).then(() => refreshGuild(false)));
  const leave = () => { if (confirm(`Leave ${g.name}? Your card and shared fights are deleted from the guild.`)) run(async () => { await leaveGuild(ui.data); ui.guild = null; }, "Left the guild"); };
  const useKey = () => { const k = keyInput; keyInput = ""; void run(async () => { setOfficerKey(ui.data, k); await refreshGuild(false); }, "Leader key saved"); };
</script>

<section><h2>What I share</h2>
  <div class="toolbar start">
    <label><input type="checkbox" checked={g.share.gear} disabled={gs.busy} onchange={(e) => share("gear", e.currentTarget.checked)}> My item level and CP</label>
    <label><input type="checkbox" checked={g.share.fights} disabled={gs.busy} onchange={(e) => share("fights", e.currentTarget.checked)}> My boss fights (DPS and skills)</label>
  </div>
  <p class="hint">Your role: <b>{ROLE_LABEL[myRole(view, g)]}</b>.</p>
</section>

<section><h2>Leader key</h2>
  {#if g.officerKey}
    <button class="ghost" onclick={() => copy(pretty(g.officerKey!))}>Copy leader key</button>
    <p class="hint">Whoever has it is a Leader: give it only to someone who should be. Leaders can also make members Leaders from Roles, no key needed.</p>
  {:else}
    <form class="toolbar start" onsubmit={(e) => { e.preventDefault(); useKey(); }}>
      <input bind:value={keyInput} placeholder="Leader key" aria-label="Leader key" autocomplete="off" required><button disabled={gs.busy}>Use</button></form>
    <p class="hint">The key was shown to whoever created the guild (before roles it was called the officer key). It makes you a Leader.</p>
  {/if}
</section>

<section><h2>Leave the guild</h2>
  <button class="ghost" disabled={gs.busy} onclick={leave}>Leave {g.name}</button>
  <p class="hint">Your card and shared fights are deleted from the guild.</p>
</section>
