<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  // At a glance: the next field bosses on the guild's server, the next call-up, who is online.
  import { bossesByMap, bossLabel, bossState } from "../../../domain/bosses.ts";
  import { can, ONLINE_MS, type GuildLink, type GuildView } from "../../../domain/guild.ts";
  import { serverName } from "../../../domain/servers.ts";
  import { formatCountdown } from "../../../domain/time.ts";
  import { hm } from "../../format.ts";
  import { ui } from "../../state.svelte.ts";
  import { when } from "./run.svelte.ts";

  let { g, view, go }: { g: GuildLink; view: GuildView; go: (section: string) => void } = $props();

  const sameServer = $derived(ui.data.serverId === g.serverId);
  const nextBosses = $derived(sameServer ? bossesByMap(ui.data.bosses, ui.now).flatMap((m) => m.bosses)
    .filter((b) => bossState(b, ui.now) === "due").sort((a, b) => a.timeMs - b.timeMs).slice(0, 6) : []);
  const next = $derived(view.callups.find((c) => c.atMs > ui.now));
  const online = $derived(view.members.filter((m) => ui.now - m.seenMs < ONLINE_MS));
</script>

<div class="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
  <Panel title="Next field bosses" class="col-span-full mb-0">
    {#if !sameServer}<p class="hint mt-0">Timers come from the boss maps players on {serverName(g.serverId) || "the static's server"} share. Play a character there with the companion open to see them.</p>
    {:else if !nextBosses.length}<p class="hint mt-0">No respawn time known. Anyone with the companion open can refresh them by opening the world map in game.</p>
    {:else}<Table.Root><Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Boss</Table.Head><Table.Head class="text-right">Respawns</Table.Head></Table.Row></Table.Header>
      <Table.Body>{#each nextBosses as b (`${b.mapId}:${b.bossId}`)}<Table.Row><Table.Cell class="font-medium">{bossLabel(b, ui.data.bossNames)}</Table.Cell>
        <Table.Cell class="text-right">{formatCountdown(b.timeMs - ui.now)} · {hm(b.timeMs)}</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>{/if}
    <p class="hint">{view.hasWebhook && view.bossAlerts ? `Posted to the static's Discord ${view.leadMin} min before each respawn.` : "Not posted to the static's Discord."}
      {#if can(view, g, "manage.discord")}<Button variant="link" size="xs" class="h-auto px-0" onclick={() => go("discord")}>Discord settings</Button>{/if}
      Your own alerts: <a class="underline" href="#bosses">Field Bosses</a>.</p>
  </Panel>

  {#if can(view, g, "view.callups")}<Panel title="Next call-up" class="mb-0">
    {#if next}<p class="m-0 text-base font-semibold">{when(next.atMs)}</p><p class="m-0 text-sm text-muted-foreground">in {formatCountdown(next.atMs - ui.now)}</p><p class="mb-0 line-clamp-3 text-sm whitespace-pre-wrap break-words">{next.message}</p>
    {:else}<p class="hint mt-0">No raid planned.</p>{/if}
    <Button variant="link" size="xs" class="mt-2 px-0" onclick={() => go("callups")}>All call-ups ({view.callups.length})</Button>
  </Panel>{/if}

  {#if can(view, g, "view.members")}<Panel title="Online now" count="{online.length}/{view.memberCount}" class="mb-0">
    {#if online.length}<p class="m-0 text-sm">{online.map((m) => m.name).join(" · ")}</p>{:else}<p class="hint mt-0">Nobody is playing with the companion open.</p>{/if}
    <Button variant="link" size="xs" class="mt-2 px-0" onclick={() => go("members")}>All members</Button>
  </Panel>{/if}
</div>
