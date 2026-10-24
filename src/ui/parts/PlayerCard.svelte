<script lang="ts">
  // A player's details (Arena Log, Kill history): class, server and faction, gear when the game sent it
  // (you and your party), and their profile on shugo.gg for the rest.
  import { short, type ArenaPlayer } from "../../domain/meter.ts";
  import { faction, gearUrl, serverName } from "../../domain/servers.ts";
  import { classIcon } from "../classes.ts";

  let { p }: { p: ArenaPlayer } = $props();
  const gear = (v: number | null, f: (n: number) => string = String) => (v == null ? "—" : f(v));
  const url = $derived(gearUrl(p.name, p.serverId));
</script>

<div class="arena-gear">
  <span>{#if classIcon(p.job)}<img class="cls-icon" src={classIcon(p.job)} alt="" width="22" height="23">{/if}<b>{p.name || "Unknown name"}</b>
    · {p.job || "class not known"} · {serverName(p.serverId) || "server not known"}{faction(p.serverId) ? ` (${faction(p.serverId)})` : ""}</span>
  <span>Level {gear(p.level)} · Gear score {gear(p.gearScore)} · Combat power {gear(p.combatPower, short)}</span>
  {#if url}<a href={url} target="_blank" rel="noopener">Gear and stats on shugo.gg ↗</a>
  {:else}<span class="hint">No profile link: {p.name ? "the server is not known" : "the game has not sent this player's name"}.</span>{/if}
</div>
