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
  import { Button } from "$lib/components/ui/button/index.js";

  let { p }: { p: ArenaPlayer } = $props();
  const gear = (v: number | null, f: (n: number) => string = String) => (v == null ? "—" : f(v));
  // The official profile, read when the card opens.
  let official = $state<{ state: "none" } | { state: "loading" } | { state: "done"; v: Profile | null } | { state: "failed"; why: string }>({ state: "none" });
  $effect(() => {
    const name = p.name, server = p.serverId;
    if (!name || !server) { official = { state: "none" }; return; }
    let live = true;
    official = { state: "loading" };
    officialProfile(name, server, true).then((v) => { if (live) official = { state: "done", v }; },
      (e) => { if (live) official = { state: "failed", why: e instanceof Error ? e.message : String(e) }; });
    return () => { live = false; };
  });
</script>

<div class="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 px-1 py-1.5 text-sm">
  <span>{#if classIcon(p.job)}<img class="mr-1.5 inline-block size-5 object-contain align-[-5px]" src={classIcon(p.job)} alt="">{/if}<b>{p.name || "Unknown name"}</b>
    · {p.job || "class not known"} · {serverName(p.serverId) || "server not known"}{faction(p.serverId) ? ` (${faction(p.serverId)})` : ""}</span>
  {#if official.state === "done" && official.v}{@const o = official.v}
    <span title="From the official character profile ({hm(o.atMs)}), as the game last saved it">{o.className || p.job} · Level {gear(o.level)}
      · Item level {gear(o.itemLevel, num)} · Combat power {gear(o.combatPower, num)}</span>
  {:else}<span>Level {gear(p.level)} · Gear score {gear(p.gearScore)} · Combat power {gear(p.combatPower, short)}</span>
    {#if official.state === "loading"}<span class="text-xs text-muted-foreground">Reading the official profile…</span>
    {:else if official.state === "done"}<span class="text-xs text-muted-foreground">Not found in the official character search.</span>
    {:else if official.state === "failed"}<span class="text-xs text-muted-foreground">Official profile not read ({official.why}).</span>{/if}{/if}
  {#if p.name && p.serverId}<Button variant="outline" size="sm" onclick={() => { ui.lookup = { name: p.name, serverId: p.serverId }; ui.tab = "players"; history.replaceState(null, "", "#players"); }}>Gear and stats</Button>
  {:else}<span class="text-xs text-muted-foreground">No profile: {p.name ? "the server is not known" : "the game has not sent this player's name"}.</span>{/if}
</div>
