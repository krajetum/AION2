<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import Intro from "$lib/components/app/Intro.svelte";
  import Panel from "$lib/components/app/Panel.svelte";
  import Empty from "../parts/Empty.svelte";
  import { addBossLead, removeBossLead, setBossLead, setBossName, setBossRepeat, toggleBossAlert } from "../../app/bosses.ts";
  import { channelVolume, themeFor } from "../../domain/alerts.ts";
  import { bossesByMap, bossLabel, bossState, needsName } from "../../domain/bosses.ts";
  import { formatCountdown } from "../../domain/time.ts";
  import { playSound } from "../../infra/notifier.ts";
  import { act, commit } from "../actions.ts";
  import { labelMap } from "../../app/arena.ts";
  import { ABYSS_BOSS_NAMES } from "../../domain/bosses.ts";
  import { mapLabel } from "../../domain/arena.ts";
  import { hm } from "../format.ts";
  import { ICON } from "../icons.ts";
  import LeadsRow from "../parts/LeadsRow.svelte";
  import { ui } from "../state.svelte.ts";

  const maps = $derived(bossesByMap(ui.data.bosses, ui.now));
  const alerts = $derived(ui.data.bossAlerts);
  const channelOn = $derived(ui.data.settings.channels.boss?.on ?? false);
  const ago = (t: number) => { const m = Math.max(0, Math.round((ui.now - t) / 60_000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
</script>

<Intro><p>The game sends the field bosses when you open the world map (your side's map and the Abyss).
  Open it again to refresh: a boss can be killed after the map was read. Ring the bell on a boss to get an alert before it respawns.
  Bosses the game data doesn't name (the Abyss's, so far) can be named by you: the list suggests the Abyss bosses A2Tools knows,
  but which one is which isn't in the data, so match them by their respawn times in game.</p></Intro>
{#if Object.keys(alerts).length && !channelOn}<p class="hint">Boss alerts are off in <a class="underline" href="#settings">Settings</a> (Notifications).</p>{/if}

{#if !maps.length}<Empty>No map read yet. Open the world map in game with the companion running.</Empty>
{:else}{#each maps as m (m.mapId)}<Panel>
  {#snippet head()}<Input class="h-7 w-56 border-transparent bg-transparent px-1 text-sm font-semibold hover:border-input dark:bg-transparent" value={ui.data.arena.maps[m.mapId] ?? ""} placeholder={mapLabel(ui.data.arena.maps, m.mapId)} aria-label="Name for map {m.mapId}" autocomplete="off"
    title="Name this map (map {m.mapId})" onchange={(e) => commit(e, (v) => labelMap(ui.data, m.mapId, v), () => ui.data.arena.maps[m.mapId] ?? "")} />{/snippet}
  {#snippet actions()}<span class="text-xs text-muted-foreground">read {hm(m.seenMs)} · {ago(m.seenMs)} ago</span>{/snippet}
  <Table.Root>
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Boss</Table.Head><Table.Head>Status</Table.Head><Table.Head class="text-right">Time</Table.Head><Table.Head class="w-12 text-right">Alert</Table.Head></Table.Row></Table.Header>
    <Table.Body>{#each m.bosses as b (b.bossId)}{@const st = bossState(b, ui.now)}{@const a = alerts[b.bossId]}<Table.Row class={st === "unknown" ? "text-muted-foreground" : ""}>
      <Table.Cell>{#if needsName(b) || ui.data.bossNames[b.bossId]}<Input class="h-7 w-64" list="abyss-bosses" value={ui.data.bossNames[b.bossId] ?? ""} placeholder={needsName(b) ? `Unknown boss #${b.bossId}: name it` : bossLabel(b)}
          aria-label="Name for boss {b.bossId}" autocomplete="off" onchange={(e) => commit(e, (v) => setBossName(ui.data, b.bossId, v), () => ui.data.bossNames[b.bossId] ?? "")} />
        {:else}<span class="font-medium">{bossLabel(b, ui.data.bossNames)}</span>{/if}</Table.Cell>
      <Table.Cell><Badge variant="secondary" class={st === "up" ? "text-hps" : st === "passed" ? "text-gold" : "text-muted-foreground"}>{st === "up" ? "Up" : st === "due" ? "Respawning" : st === "passed" ? "Should be up" : "No time given"}</Badge></Table.Cell>
      <Table.Cell class="text-right">{st === "up" ? (b.timeMs ? `since ${hm(b.timeMs)}` : "—") : st === "due" ? `${formatCountdown(b.timeMs - ui.now)} · ${hm(b.timeMs)}`
        : st === "passed" ? `since ${hm(b.timeMs)}` : "—"}</Table.Cell>
      <Table.Cell class="text-right"><Button variant="ghost" size="icon-sm" class={a ? "text-gold" : "text-muted-foreground"} aria-pressed={!!a} aria-label="{a ? 'Remove' : 'Add'} alert for {bossLabel(b, ui.data.bossNames)}"
        title={a ? `Alert ${a.leads.join(", ")} min before · ${a.repeat ? "every respawn" : "once"}` : "Alert me before it respawns"}
        onclick={() => act(() => toggleBossAlert(ui.data, b.bossId))}><ICON.bell /></Button></Table.Cell></Table.Row>
      {#if a}<Table.Row class="hover:bg-transparent"><Table.Cell colspan={4} class="bg-muted/40 p-3 whitespace-normal">
        <LeadsRow label={bossLabel(b, ui.data.bossNames)} leads={a.leads} next={st === "due" ? b.timeMs : undefined}
          onadd={() => addBossLead(ui.data, b.bossId)} onremove={(i) => removeBossLead(ui.data, b.bossId, i)} onset={(i, v) => setBossLead(ui.data, b.bossId, i, v)} />
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <ToggleGroup.Root type="single" variant="outline" size="sm" aria-label="How often for {bossLabel(b, ui.data.bossNames)}" value={a.repeat ? "repeat" : "once"}
            onValueChange={(v) => v && act(() => setBossRepeat(ui.data, b.bossId, v === "repeat"))}>
            <ToggleGroup.Item value="once">Once</ToggleGroup.Item><ToggleGroup.Item value="repeat">Every respawn</ToggleGroup.Item></ToggleGroup.Root>
          <Button variant="ghost" size="sm" title="sounds/boss.wav" onclick={() => playSound(["boss", "event"], channelVolume(ui.data.settings, "boss") || 70, themeFor(ui.data.settings, "boss"))}>Play sound</Button>
          {#if st !== "due"}<span class="text-xs text-muted-foreground">{a.repeat ? "Fires each time the map shows a respawn time." : "Fires once, on the next respawn time the map shows."}</span>{/if}
        </div></Table.Cell></Table.Row>{/if}
    {/each}</Table.Body>
  </Table.Root></Panel>{/each}{/if}
<datalist id="abyss-bosses">{#each ABYSS_BOSS_NAMES as n}<option value={n}></option>{/each}</datalist>
