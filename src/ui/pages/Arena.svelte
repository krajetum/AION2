<script lang="ts">
  import { classIcon } from "../classes.ts";
  import { labelMap } from "../../app/arena.ts";
  import { matchTotals } from "../../domain/arena.ts";
  import { faction, gearUrl, serverName } from "../../domain/servers.ts";
  import { clock, short, type ArenaMatch } from "../../domain/meter.ts";
  import { commit } from "../actions.ts";
  import { hm } from "../format.ts";
  import { ui } from "../state.svelte.ts";

  const log = $derived(ui.data.arena);
  const key = (m: ArenaMatch) => `${m.mapId}:${m.startMs}`;
  let open = $state(""), player = $state("");
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
      <td><span class="name">{log.maps[m.mapId] || `Map ${m.mapId}`}</span><small>{t.opponents} {t.opponents === 1 ? "opponent" : "opponents"}</small></td>
      <td class="n">{clock(t.ms)}</td><td class="n">{short(t.dealt)}</td><td class="n">{short(t.taken)}</td>
      <td class="n">{t.ourDeaths} : {t.theirDeaths}</td></tr>
    {#if open === k}<tr class="skills"><td colspan="6">
      <label class="arena-map">Map {m.mapId} name <input value={log.maps[m.mapId] ?? ""} placeholder="Arena of Solitude"
        onchange={(e) => commit(e, (v) => labelMap(ui.data, m.mapId, v), () => log.maps[m.mapId])}></label>
      <table class="sheet">
        <thead><tr><th>Player</th><th>Class</th><th class="n">Server</th><th class="n">Lv</th><th class="n">GS</th><th class="n">CP</th>
          <th class="n">Dealt</th><th class="n">Taken</th><th class="n">Deaths</th></tr></thead>
        <tbody>{#each m.players as p (p.id)}{@const pk = `${k}:${p.id}`}{@const url = gearUrl(p.name, p.serverId)}
          <tr class="prow {p.side}" class:you={p.side === "you"} style:--p="0" aria-expanded={player === pk} title="Gear and stats"
            onclick={() => { player = player === pk ? "" : pk; }}>
          <td><span class="name">{p.name || (p.side === "you" ? "You" : `#${p.id}`)}</span><small>{p.side}</small></td>
          <td class="cls">{#if classIcon(p.job)}<img class="cls-icon" src={classIcon(p.job)} alt="" width="22" height="23">{/if}{p.job || "—"}</td><td class="n" title={p.serverId ? `Server ${p.serverId}` : ""}>{serverName(p.serverId) || p.serverId || "—"}</td><td class="n">{gear(p.level)}</td><td class="n">{gear(p.gearScore)}</td>
          <td class="n">{gear(p.combatPower, short)}</td><td class="n">{short(p.dealt)}</td><td class="n">{short(p.taken)}</td><td class="n">{p.deaths}</td></tr>
          {#if player === pk}<tr class="skills"><td colspan="9"><div class="arena-gear">
            <span><b>{p.name || "Unknown name"}</b> · {p.job || "class not known"} · {serverName(p.serverId) || "server not known"}{faction(p.serverId) ? ` (${faction(p.serverId)})` : ""}</span>
            <span>Level {gear(p.level)} · Gear score {gear(p.gearScore)} · Combat power {gear(p.combatPower, short)}</span>
            {#if url}<a href={url} target="_blank" rel="noopener">Gear and stats on shugo.gg ↗</a>
            {:else}<span class="hint">No profile link: {p.name ? "the server is not known" : "the game has not sent this player's name"}.</span>{/if}
          </div></td></tr>{/if}{/each}</tbody>
      </table></td></tr>{/if}
  {/each}</tbody></table></div><p class="hint">Deaths: your side : theirs. Click a match for its players.</p></section>{/if}
