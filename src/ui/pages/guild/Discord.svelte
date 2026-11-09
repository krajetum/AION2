<script lang="ts">
  // The guild's Discord webhook (call-ups, and field-boss alerts when switched on).
  import { adminGuild, type AdminAction } from "../../../app/guild.ts";
  import type { GuildView } from "../../../domain/guild.ts";
  import { refreshGuild } from "../../actions.ts";
  import { ui } from "../../state.svelte.ts";
  import { gs, run } from "./run.svelte.ts";

  let { view }: { view: GuildView } = $props();
  let webhook = $state("");
  const admin = (a: AdminAction, done: string) =>
    run(async () => { const r = await adminGuild(ui.data, a); await refreshGuild(false); if (a.test && !r.tested) throw new Error("Discord refused the test post: check the webhook URL"); }, done);
  const saveHook = () => admin({ webhook: webhook.trim() || null, test: !!webhook.trim() }, webhook.trim() ? "Webhook saved, test posted" : "Webhook removed").then(() => { webhook = ""; });
</script>

<section><h2>Webhook</h2>
  <form class="toolbar start" onsubmit={(e) => { e.preventDefault(); saveHook(); }}>
    <input type="url" bind:value={webhook} placeholder={view.hasWebhook ? "Webhook set: paste a new one to replace it" : "Discord webhook URL"} aria-label="Discord webhook URL" autocomplete="off">
    <button disabled={gs.busy}>{webhook.trim() ? "Save and test" : view.hasWebhook ? "Remove webhook" : "Save"}</button>
    {#if view.hasWebhook}<button type="button" class="ghost" disabled={gs.busy} onclick={() => admin({ test: true }, "Test posted")}>Send test</button>{/if}
  </form>
  <p class="hint">Discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL. The URL stays on the server: it is never shown again.</p>
</section>

<section><h2>Field-boss alerts</h2>
  <div class="toolbar start">
    <label><input type="checkbox" checked={view.bossAlerts} disabled={gs.busy} onchange={(e) => admin({ bossAlerts: e.currentTarget.checked }, e.currentTarget.checked ? "Field-boss alerts on" : "Field-boss alerts off")}>
      Post field-boss alerts</label>
    {#if view.bossAlerts}<label><select value={view.leadMin} disabled={gs.busy} onchange={(e) => admin({ leadMin: Number(e.currentTarget.value) }, "Lead time saved")}>
      {#each [1, 2, 3, 5, 10, 15] as m}<option value={m}>{m}</option>{/each}</select> minutes before a respawn</label>{/if}
  </div>
  <p class="hint">Call-ups are posted to the webhook either way.</p>
</section>

<style>
  input[type="url"] { min-width: 0; flex: 1 1 260px; }
</style>
