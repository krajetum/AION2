<script lang="ts">
  // The invite code: copy it for a new member, or replace it (the old one stops working).
  import { adminGuild } from "../../../app/guild.ts";
  import type { GuildLink } from "../../../domain/guild.ts";
  import { refreshGuild } from "../../actions.ts";
  import { ui } from "../../state.svelte.ts";
  import { copy, gs, pretty, run } from "./run.svelte.ts";

  let { g }: { g: GuildLink } = $props();
  const rotate = () => {
    if (confirm("New invite code? The old one stops working; members already in stay."))
      run(() => adminGuild(ui.data, { rotateCode: true }).then(() => refreshGuild(false)), "New invite code: copy it here");
  };
</script>

<section><h2>Invite code</h2>
  {#if g.memberCode}<p class="code" translate="no">{pretty(g.memberCode)}</p>{/if}
  <div class="toolbar start">
    {#if g.memberCode}<button onclick={() => copy(pretty(g.memberCode!))}>Copy invite code</button>{/if}
    <button class="ghost" disabled={gs.busy} onclick={rotate}>New invite code</button>
  </div>
  <p class="hint">Give it to whoever should join. A new code makes the old one useless: do it after removing someone.
    {#if !g.memberCode}This install doesn't know the current code: make a new one.{/if}
    The code shown is the one this install last knew: if someone else made a new one, make another or ask them.</p>
</section>

<style>
  .code { margin: 0 0 8px; font-size: 18px; font-weight: 600; letter-spacing: 1px; font-variant-numeric: tabular-nums; }
</style>
