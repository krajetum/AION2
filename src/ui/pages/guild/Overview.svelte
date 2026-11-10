<script lang="ts">
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

<div class="overview">
  <section class="wide"><h2>Next field bosses</h2>
    {#if !sameServer}<p class="hint">Timers come from the boss maps players on {serverName(g.serverId) || "the guild's server"} share. Play a character there with the companion open to see them.</p>
    {:else if !nextBosses.length}<p class="hint">No respawn time known. Anyone with the companion open can refresh them by opening the world map in game.</p>
    {:else}<div class="scroll"><table class="sheet"><thead><tr><th>Boss</th><th class="n">Respawns</th></tr></thead>
      <tbody>{#each nextBosses as b (`${b.mapId}:${b.bossId}`)}<tr><td><span class="name">{bossLabel(b, ui.data.bossNames)}</span></td>
        <td class="n num">{formatCountdown(b.timeMs - ui.now)} · {hm(b.timeMs)}</td></tr>{/each}</tbody></table></div>{/if}
    <p class="hint">{view.hasWebhook && view.bossAlerts ? `Posted to the guild's Discord ${view.leadMin} min before each respawn.` : "Not posted to the guild's Discord."}
      {#if can(view, g, "manage.discord")}<button class="link" onclick={() => go("discord")}>Discord settings</button>{/if}
      Your own alerts: <a href="#bosses">Field Bosses</a>.</p>
  </section>

  {#if can(view, g, "view.callups")}<section><h2>Next call-up</h2>
    {#if next}<p class="big">{when(next.atMs)}</p><p class="dim">in {formatCountdown(next.atMs - ui.now)}</p><p class="msg">{next.message}</p>
    {:else}<p class="hint">No raid planned.</p>{/if}
    <button class="link" onclick={() => go("callups")}>All call-ups ({view.callups.length})</button>
  </section>{/if}

  {#if can(view, g, "view.members")}<section><h2>Online now <span class="count">{online.length}/{view.memberCount}</span></h2>
    {#if online.length}<p>{online.map((m) => m.name).join(" · ")}</p>{:else}<p class="hint">Nobody is playing with the companion open.</p>{/if}
    <button class="link" onclick={() => go("members")}>All members</button>
  </section>{/if}
</div>

<style>
  .overview { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
  .overview section { margin: 0; }
  .wide { grid-column: 1 / -1; }
  .big { margin: 0; font-size: 16px; font-weight: 600; }
  .msg { white-space: pre-wrap; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
</style>
