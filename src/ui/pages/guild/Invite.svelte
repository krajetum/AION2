<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
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

<Panel title="Invite code">
  {#if g.memberCode}<p class="mt-0 mb-2 font-mono text-2xl font-semibold tracking-wider tabular-nums" translate="no">{pretty(g.memberCode)}</p>{/if}
  <div class="flex flex-wrap gap-2">
    {#if g.memberCode}<Button size="sm" onclick={() => copy(pretty(g.memberCode!))}>Copy invite code</Button>{/if}
    <Button variant="outline" size="sm" disabled={gs.busy} onclick={rotate}>New invite code</Button>
  </div>
  <p class="hint">Give it to whoever should join. A new code makes the old one useless: do it after removing someone.
    {#if !g.memberCode}This install doesn't know the current code: make a new one.{/if}
    The code shown is the one this install last knew: if someone else made a new one, make another or ask them.</p>
</Panel>
