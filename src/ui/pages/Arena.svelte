<script lang="ts">
  import { classIcon } from "../classes.ts";
  import { labelMap } from "../../app/arena.ts";
  import { KNOWN_MAPS, mapLabel, matchTotals } from "../../domain/arena.ts";
  import { serverName } from "../../domain/servers.ts";
  import PlayerCard from "../parts/PlayerCard.svelte";
  import { clock, short, type ArenaMatch } from "../../domain/meter.ts";
  import { commit } from "../actions.ts";
  import { hm } from "../format.ts";
  import { ui } from "../state.svelte.ts";

  const log = $derived(ui.data.arena);
  const key = (m: ArenaMatch) => `${m.mapId}:${m.startMs}`;
  let open = $state(""), player = $state("");
  // Kill history: your kills or your deaths (who killed you).
  type KillKind = "kill" | "assist" | "death";
  const KILL_VIEWS: [KillKind, string][] = [["kill", "Your kills"], ["assist", "Assists"], ["death", "Killed by"]];
  let killView = $state<KillKind>("kill"), killOpen = $state("");
  const count = (kind: KillKind) => log.kills.filter((k) => k.kind === kind).length;
  // Maps in the log without a name yet: named once, every match and kill there shows it.
  const MAP_PRESETS = ["Arena", "Battlefield", "Altgard", "Verteron", "Lower Abyss", "Upper Abyss"];
  const unnamed = $derived([...new Set([...log.kills.map((k) => k.mapId), ...log.matches.map((m) => m.mapId)])]
    .filter((id): id is number => id != null && !log.maps[id] && !KNOWN_MAPS[id]));
  const kills = $derived(log.kills.filter((k) => k.kind === killView));

  const killKey = (k: { atMs: number; other: { id: number } }) => `${k.atMs}:${k.other.id}`;
  const when = (t: number) => `${new Date(t).toLocaleDateString([], { day: "2-digit", month: "short" })} ${hm(t)}`;
  const gear = (v: number | null, f: (n: number) => string = String) => (v == null ? "—" : f(v));
</script>

<p class="hint dps-note">PvP on an instance map is logged when you leave it. Name a map once (e.g. “Arena of Solitude”) and its matches get that name.
  Opponents' gear is not in any packet the meter reads yet, so it shows “—”; yours and your party's come from the game.
  Click a player for their gear and stats on shugo.gg (a third-party armory that reads the official character data).</p>

{#if !log.matches.length}<section class="empty-fight"><p class="hint">No match yet. Keep the companion open while you play an arena match.</p></section>
{:else}<section class="dps-table"><div class="scroll"><table class="sheet">
  <thead><tr><th>When</th><th>Map</th><th class="n">Time</th><th class="n">Dealt</th><th class="n">Taken</th><th class="n">Deaths</th></tr></thead>
  <tbody>{#each log.matches as m (key(m))}{@const t = matchTotals(m)}{@const k = key(m)}
    <tr class="prow" style:--p={String(t.dealt + t.taken ? t.dealt / (t.dealt + t.taken) : 0)} aria-expanded={open === k} onclick={() => { open = open === k ? "" : k; }}>
      <td>{when(m.startMs)}</td>
      <td><span class="name">{mapLabel(log.maps, m.mapId)}</span><small>{t.opponents} {t.opponents === 1 ? "opponent" : "opponents"}</small></td>
      <td class="n">{clock(t.ms)}</td><td class="n">{short(t.dealt)}</td><td class="n">{short(t.taken)}</td>
      <td class="n">{t.ourDeaths} : {t.theirDeaths}</td></tr>
    {#if open === k}<tr class="skills"><td colspan="6">
      <label class="arena-map">Map {m.mapId} name <input value={log.maps[m.mapId] ?? ""} placeholder="Arena of Solitude"
        onchange={(e) => commit(e, (v) => labelMap(ui.data, m.mapId, v), () => log.maps[m.mapId])}></label>
      <table class="sheet">
        <thead><tr><th>Player</th><th>Class</th><th class="n">Server</th><th class="n">Lv</th><th class="n">GS</th><th class="n">CP</th>
          <th class="n">Dealt</th><th class="n">Taken</th><th class="n">Deaths</th></tr></thead>
        <tbody>{#each m.players as p (p.id)}{@const pk = `${k}:${p.id}`}
          <tr class="prow {p.side}" class:you={p.side === "you"} style:--p="0" aria-expanded={player === pk} title="Gear and stats"
            onclick={() => { player = player === pk ? "" : pk; }}>
          <td><span class="name">{p.name || (p.side === "you" ? "You" : `#${p.id}`)}</span><small>{p.side}</small></td>
          <td class="cls">{#if classIcon(p.job)}<img class="cls-icon" src={classIcon(p.job)} alt="" width="22" height="23">{/if}{p.job || "—"}</td><td class="n" title={p.serverId ? `Server ${p.serverId}` : ""}>{serverName(p.serverId) || p.serverId || "—"}</td><td class="n">{gear(p.level)}</td><td class="n">{gear(p.gearScore)}</td>
          <td class="n">{gear(p.combatPower, short)}</td><td class="n">{short(p.dealt)}</td><td class="n">{short(p.taken)}</td><td class="n">{p.deaths}</td></tr>
          {#if player === pk}<tr class="skills"><td colspan="9"><PlayerCard {p} /></td></tr>{/if}{/each}</tbody>
      </table></td></tr>{/if}
  {/each}</tbody></table></div><p class="hint">Deaths: your side : theirs. Click a match for its players.</p></section>{/if}

<section class="dps-table kill-history"><h2>Kill history
    <span class="count">{count("kill")} {count("kill") === 1 ? "kill" : "kills"} · {count("assist")} {count("assist") === 1 ? "assist" : "assists"} · {count("death")} {count("death") === 1 ? "death" : "deaths"}</span></h2>
  <div class="seg" role="group" aria-label="Show">
    {#each KILL_VIEWS as [v, label]}<button class:on={killView === v} aria-pressed={killView === v} onclick={() => { killView = v; killOpen = ""; }}>{label}</button>{/each}</div>
  {#if !kills.length}<p class="hint">{killView === "kill" ? "No kill yet." : killView === "assist" ? "No assist yet." : "Nobody has killed you yet."} PvP kills, assists and deaths are logged while the companion runs, anywhere.</p>
  {:else}<div class="scroll"><table class="sheet">
    <thead><tr><th>When</th><th>Player</th><th>Class</th><th class="n">Server</th><th>Where</th>
      <th class="n">{killView === "death" ? "They dealt" : "You dealt"}</th><th class="n">{killView === "death" ? "You dealt" : "They dealt"}</th></tr></thead>
    <tbody>{#each kills as k (killKey(k))}{@const o = k.other}{@const kk = killKey(k)}
      <tr class="prow" aria-expanded={killOpen === kk} title="Gear and stats" style:--p="0" onclick={() => { killOpen = killOpen === kk ? "" : kk; }}>
        <td>{when(k.atMs)}</td>
        <td><span class="name">{o.name || `#${o.id}`}</span></td>
        <td class="cls">{#if classIcon(o.job)}<img class="cls-icon" src={classIcon(o.job)} alt="" width="22" height="23">{/if}{o.job || "—"}</td>
        <td class="n">{serverName(o.serverId) || o.serverId || "—"}</td>
        <td>{#if k.mapId == null}<span class="hint" title="No map load since the app started: after the next teleport or zone change the map is known">Unknown</span>
          {:else}{mapLabel(log.maps, k.mapId)}{/if}</td>
        <td class="n">{short(killView === "death" ? o.dealt : o.taken)}</td><td class="n">{short(killView === "death" ? o.taken : o.dealt)}</td></tr>
      {#if killOpen === kk}<tr class="skills"><td colspan="7"><PlayerCard p={o} /></td></tr>{/if}
    {/each}</tbody></table></div>
    <p class="hint">The killer is the last player who hit before the death (the game sends no "killed by"); an assist is your hit in the
      15 s before someone else's last one. Damage is since the map was loaded. "Unknown" map: the app started after you entered it,
      so the next teleport or zone change tells.</p>{/if}
  {#if unnamed.length}<div class="map-names"><b>Name your maps</b>
    {#each unnamed as id (id)}<label>Map {id} <input list="map-presets" placeholder="e.g. Lower Abyss" autocomplete="off"
      onchange={(e) => commit(e, (v) => labelMap(ui.data, id, v), () => log.maps[id] ?? "")}></label>{/each}
    <datalist id="map-presets">{#each MAP_PRESETS as n}<option value={n}></option>{/each}</datalist>
    <span class="hint">Named once, every match and kill on that map shows it. Map ids are per game map, so a faction's whole world is one map.</span></div>{/if}
</section>
