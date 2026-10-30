<script lang="ts">
  import { addBossLead, removeBossLead, setBossLead, setBossName, setBossRepeat, toggleBossAlert } from "../../app/bosses.ts";
  import { channelVolume } from "../../domain/alerts.ts";
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

<p class="hint intro">The game sends the field bosses when you open the world map (your side's map and the Abyss).
  Open it again to refresh: a boss can be killed after the map was read. Ring the bell on a boss to get an alert before it respawns.
  Bosses the game data doesn't name (the Abyss's, so far) can be named by you: the list suggests the Abyss bosses A2Tools knows,
  but which one is which isn't in the data, so match them by their respawn times in game.</p>
{#if Object.keys(alerts).length && !channelOn}<p class="hint">Boss alerts are off in <a href="#settings">Settings</a> (Notifications).</p>{/if}

{#if !maps.length}<p class="empty">No map read yet. Open the world map in game with the companion running.</p>
{:else}{#each maps as m (m.mapId)}<section class="dps-table"><h2><input class="map-title" value={ui.data.arena.maps[m.mapId] ?? ""} placeholder={mapLabel(ui.data.arena.maps, m.mapId)} aria-label="Name for map {m.mapId}" autocomplete="off"
    title="Name this map (map {m.mapId})" onchange={(e) => commit(e, (v) => labelMap(ui.data, m.mapId, v), () => ui.data.arena.maps[m.mapId] ?? "")}> <span class="count">read {hm(m.seenMs)} · {ago(m.seenMs)} ago</span></h2>
  <div class="scroll"><table class="sheet">
    <thead><tr><th>Boss</th><th>Status</th><th class="n">Time</th><th class="n">Alert</th></tr></thead>
    <tbody>{#each m.bosses as b (b.bossId)}{@const st = bossState(b, ui.now)}{@const a = alerts[b.bossId]}<tr class="boss {st}">
      <td>{#if needsName(b) || ui.data.bossNames[b.bossId]}<input class="boss-name" list="abyss-bosses" value={ui.data.bossNames[b.bossId] ?? ""} placeholder={needsName(b) ? `Unknown boss #${b.bossId}: name it` : bossLabel(b)}
          aria-label="Name for boss {b.bossId}" autocomplete="off" onchange={(e) => commit(e, (v) => setBossName(ui.data, b.bossId, v), () => ui.data.bossNames[b.bossId] ?? "")}>
        {:else}<span class="name">{bossLabel(b, ui.data.bossNames)}</span>{/if}</td>
      <td>{st === "up" ? "Up" : st === "due" ? "Respawning" : st === "passed" ? "Should be up" : "No time given"}</td>
      <td class="n num">{st === "up" ? (b.timeMs ? `since ${hm(b.timeMs)}` : "—") : st === "due" ? `${formatCountdown(b.timeMs - ui.now)} · ${hm(b.timeMs)}`
        : st === "passed" ? `since ${hm(b.timeMs)}` : "—"}</td>
      <td class="n"><button class="ghost bell" class:on={!!a} aria-pressed={!!a} aria-label="{a ? 'Remove' : 'Add'} alert for {bossLabel(b, ui.data.bossNames)}"
        title={a ? `Alert ${a.leads.join(", ")} min before · ${a.repeat ? "every respawn" : "once"}` : "Alert me before it respawns"}
        onclick={() => act(() => toggleBossAlert(ui.data, b.bossId))}>{@html ICON.bell}</button></td></tr>
      {#if a}<tr class="skills boss-alert"><td colspan="4">
        <LeadsRow label={bossLabel(b, ui.data.bossNames)} leads={a.leads} next={st === "due" ? b.timeMs : undefined}
          onadd={() => addBossLead(ui.data, b.bossId)} onremove={(i) => removeBossLead(ui.data, b.bossId, i)} onset={(i, v) => setBossLead(ui.data, b.bossId, i, v)} />
        <div class="alert-opts">
          <div class="seg" role="group" aria-label="How often for {bossLabel(b, ui.data.bossNames)}">
            <button class:on={!a.repeat} aria-pressed={!a.repeat} onclick={() => act(() => setBossRepeat(ui.data, b.bossId, false))}>Once</button>
            <button class:on={a.repeat} aria-pressed={a.repeat} onclick={() => act(() => setBossRepeat(ui.data, b.bossId, true))}>Every respawn</button></div>
          <button class="ghost" title="sounds/boss.wav" onclick={() => playSound(["boss", "event"], channelVolume(ui.data.settings, "boss") || 70)}>Play sound</button>
          {#if st !== "due"}<span class="hint">{a.repeat ? "Fires each time the map shows a respawn time." : "Fires once, on the next respawn time the map shows."}</span>{/if}
        </div></td></tr>{/if}
    {/each}</tbody>
  </table></div></section>{/each}{/if}
<datalist id="abyss-bosses">{#each ABYSS_BOSS_NAMES as n}<option value={n}></option>{/each}</datalist>
