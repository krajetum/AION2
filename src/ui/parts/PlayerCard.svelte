<script lang="ts">
  // A player's details (Arena Log, Kill history): class, server and faction, gear when the game sent it
  // (you and your party), the official profile's level / item level / combat power (infra/armory.ts), and a button to
  // the Players page with their whole profile (gear, arcana, skills).
  import { short, type ArenaPlayer } from "../../domain/meter.ts";
  import { faction, serverName } from "../../domain/servers.ts";
  import type { Profile } from "../../domain/armory.ts";
  import { officialProfile } from "../../infra/armory.ts";
  import { classIcon } from "../classes.ts";
  import { hm, num } from "../format.ts";
  import { ui } from "../state.svelte.ts";

  let { p }: { p: ArenaPlayer } = $props();
  const gear = (v: number | null, f: (n: number) => string = String) => (v == null ? "—" : f(v));
  // The official profile, read when the card opens.
  let official = $state<{ state: "none" } | { state: "loading" } | { state: "done"; v: Profile | null } | { state: "failed"; why: string }>({ state: "none" });
  $effect(() => {
    const name = p.name, server = p.serverId;
    if (!name || !server) { official = { state: "none" }; return; }
    let live = true;
    official = { state: "loading" };
    officialProfile(name, server).then((v) => { if (live) official = { state: "done", v }; },
      (e) => { if (live) official = { state: "failed", why: e instanceof Error ? e.message : String(e) }; });
    return () => { live = false; };
  });
</script>

<div class="arena-gear">
  <span>{#if classIcon(p.job)}<img class="cls-icon" src={classIcon(p.job)} alt="" width="22" height="23">{/if}<b>{p.name || "Unknown name"}</b>
    · {p.job || "class not known"} · {serverName(p.serverId) || "server not known"}{faction(p.serverId) ? ` (${faction(p.serverId)})` : ""}</span>
  {#if official.state === "done" && official.v}{@const o = official.v}
    <span title="From the official character profile ({hm(o.atMs)}), as the game last saved it">{o.className || p.job} · Level {gear(o.level)}
      · Item level {gear(o.itemLevel, num)} · Combat power {gear(o.combatPower, num)}</span>
  {:else}<span>Level {gear(p.level)} · Gear score {gear(p.gearScore)} · Combat power {gear(p.combatPower, short)}</span>
    {#if official.state === "loading"}<span class="hint">Reading the official profile…</span>
    {:else if official.state === "done"}<span class="hint">Not found in the official character search.</span>
    {:else if official.state === "failed"}<span class="hint">Official profile not read ({official.why}).</span>{/if}{/if}
  {#if p.name && p.serverId}<button onclick={() => { ui.lookup = { name: p.name, serverId: p.serverId }; ui.tab = "players"; history.replaceState(null, "", "#players"); }}>Gear and stats</button>
  {:else}<span class="hint">No profile: {p.name ? "the server is not known" : "the game has not sent this player's name"}.</span>{/if}
</div>
