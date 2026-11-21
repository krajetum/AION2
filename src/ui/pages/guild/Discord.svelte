<script lang="ts">
  // The guild's Discord webhook (call-ups, and field-boss alerts when switched on).
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { NativeSelect, NativeSelectOption } from "$lib/components/ui/native-select/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
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

<Panel title="Webhook">
  <form class="flex flex-wrap gap-2" onsubmit={(e) => { e.preventDefault(); saveHook(); }}>
    <Input class="min-w-0 flex-[1_1_260px]" type="url" bind:value={webhook} placeholder={view.hasWebhook ? "Webhook set: paste a new one to replace it" : "Discord webhook URL"} aria-label="Discord webhook URL" autocomplete="off" />
    <Button type="submit" disabled={gs.busy}>{webhook.trim() ? "Save and test" : view.hasWebhook ? "Remove webhook" : "Save"}</Button>
    {#if view.hasWebhook}<Button type="button" variant="ghost" disabled={gs.busy} onclick={() => admin({ test: true }, "Test posted")}>Send test</Button>{/if}
  </form>
  <p class="hint">Discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL. The URL stays on the server: it is never shown again.</p>
</Panel>

<Panel title="Field-boss alerts">
  <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
    <label class="flex cursor-pointer items-center gap-2.5"><Switch checked={view.bossAlerts} disabled={gs.busy} onCheckedChange={(on) => admin({ bossAlerts: on }, on ? "Field-boss alerts on" : "Field-boss alerts off")} />
      Post field-boss alerts</label>
    {#if view.bossAlerts}<label class="flex items-center gap-2 text-muted-foreground"><NativeSelect size="sm" value={view.leadMin} disabled={gs.busy} onchange={(e) => admin({ leadMin: Number(e.currentTarget.value) }, "Lead time saved")}>
      {#each [1, 2, 3, 5, 10, 15] as m}<NativeSelectOption value={m}>{m}</NativeSelectOption>{/each}</NativeSelect> minutes before a respawn</label>{/if}
  </div>
  <p class="hint">Call-ups are posted to the webhook either way.</p>
</Panel>
