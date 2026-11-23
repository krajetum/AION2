<script lang="ts">
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import Intro from "$lib/components/app/Intro.svelte";
  import Panel from "$lib/components/app/Panel.svelte";
  import UnderlineTabs from "$lib/components/app/UnderlineTabs.svelte";
  import Empty from "../parts/Empty.svelte";
  import { classIcon } from "../classes.ts";
  import { labelMap } from "../../app/arena.ts";
  import { isDungeonMap, KNOWN_MAPS, mapLabel, matchTotals } from "../../domain/arena.ts";
  import { serverName } from "../../domain/servers.ts";
  import PlayerCard from "../parts/PlayerCard.svelte";
  import type { Profile } from "../../domain/armory.ts";
  import { officialProfile } from "../../infra/armory.ts";
  import { clock, short, type ArenaMatch } from "../../domain/meter.ts";
  import { commit } from "../actions.ts";
  import { hm } from "../format.ts";
  import { ui } from "../state.svelte.ts";

  // Matches and kills logged in dungeons by older versions are hidden (kept in the save): PvE, never a match.
  const log = $derived({ ...ui.data.arena, matches: ui.data.arena.matches.filter((m) => !isDungeonMap(m.mapId)),
    kills: ui.data.arena.kills.filter((k) => !isDungeonMap(k.mapId)) });
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

  // A match opened: every player whose gear the game didn't send gets their official profile (item level as GS, combat
  // power), read in turn by the armory queue, so the table fills without clicking each player.
  let official = $state<Record<string, Profile | null>>({});
  const okey = (name: string, serverId: number) => `${serverId}|${name}`;
  $effect(() => {
    const m = log.matches.find((x) => key(x) === open);
    if (!m) return;
    for (const p of m.players) {
      if (!p.name || !p.serverId || (p.gearScore != null && p.combatPower != null)) continue;
      const k = okey(p.name, p.serverId);
      if (k in official) continue;
      official[k] = null;
      officialProfile(p.name, p.serverId).then((v) => { if (v) official[k] = v; }, () => { delete official[k]; });
    }
  });
  const offOf = (p: { name: string; serverId: number | null }) => (p.name && p.serverId ? official[okey(p.name, p.serverId)] ?? null : null);
</script>

<Intro><p>PvP on an instance map is logged when you leave it. Name a map once (e.g. “Arena of Solitude”) and its matches get that name.
  Yours and your party's gear come from the game; opponents' GS (item level) and CP come from their official profile when you open the match.
  Click a player, then "Gear and stats" for their whole official profile.</p></Intro>

{#snippet cls(job: string)}<span class="flex items-center gap-1.5">{#if classIcon(job)}<img class="size-5 object-contain" src={classIcon(job)} alt="">{/if}{job || "—"}</span>{/snippet}
{#snippet chev(on: boolean)}<ChevronRight class="size-4 text-muted-foreground transition-transform {on ? 'rotate-90' : ''}" />{/snippet}

{#if !log.matches.length}<Empty>No match yet. Keep the companion open while you play an arena match.</Empty>
{:else}<Panel title="Matches" count={log.matches.length}><Table.Root>
  <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head class="w-8"></Table.Head><Table.Head>When</Table.Head><Table.Head>Map</Table.Head><Table.Head class="text-right">Time</Table.Head><Table.Head class="text-right">Dealt</Table.Head><Table.Head class="text-right">Taken</Table.Head><Table.Head class="text-right">Deaths</Table.Head></Table.Row></Table.Header>
  <Table.Body>{#each log.matches as m (key(m))}{@const t = matchTotals(m)}{@const k = key(m)}
    <Table.Row class="bar-row cursor-pointer border-0" tabindex={0} style="--p: {t.dealt + t.taken ? t.dealt / (t.dealt + t.taken) : 0}" aria-expanded={open === k} onclick={() => { open = open === k ? "" : k; }}>
      <Table.Cell>{@render chev(open === k)}</Table.Cell>
      <Table.Cell class="text-muted-foreground">{when(m.startMs)}</Table.Cell>
      <Table.Cell><span class="font-medium">{mapLabel(log.maps, m.mapId)}</span> <span class="text-xs text-muted-foreground">{t.opponents} {t.opponents === 1 ? "opponent" : "opponents"}{#if m.rounds}{" "}· {m.rounds.length} rounds{/if}</span></Table.Cell>
      <Table.Cell class="text-right">{clock(t.ms)}</Table.Cell><Table.Cell class="text-right">{short(t.dealt)}</Table.Cell><Table.Cell class="text-right">{short(t.taken)}</Table.Cell>
      <Table.Cell class="text-right font-semibold">{t.ourDeaths} : {t.theirDeaths}</Table.Cell></Table.Row>
    {#if open === k}<Table.Row class="hover:bg-transparent"><Table.Cell colspan={7} class="bg-muted/40 p-3 whitespace-normal">
      <label class="mb-2 flex items-center gap-2 text-sm text-muted-foreground">Map {m.mapId} name <Input class="h-7 w-56" value={log.maps[m.mapId] ?? ""} placeholder="Arena of Solitude"
        onchange={(e) => commit(e, (v) => labelMap(ui.data, m.mapId, v), () => log.maps[m.mapId])} /></label>
      <Table.Root>
        <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Player</Table.Head><Table.Head>Class</Table.Head><Table.Head class="text-right">Server</Table.Head><Table.Head class="text-right">Lv</Table.Head><Table.Head class="text-right">GS</Table.Head><Table.Head class="text-right">CP</Table.Head>
          <Table.Head class="text-right">Dealt</Table.Head><Table.Head class="text-right">Taken</Table.Head><Table.Head class="text-right">Deaths</Table.Head></Table.Row></Table.Header>
        <Table.Body>{#each m.players as p (p.id)}{@const pk = `${k}:${p.id}`}{@const o = offOf(p)}
          <Table.Row class="cursor-pointer" tabindex={0} aria-expanded={player === pk} title="Gear and stats" onclick={() => { player = player === pk ? "" : pk; }}>
          <Table.Cell><span class="font-medium {p.side === 'you' ? 'text-primary' : p.side === 'opponent' ? 'text-taken' : ''}">{p.name || (p.side === "you" ? "You" : `#${p.id}`)}</span> <span class="text-xs text-muted-foreground">{p.side}</span></Table.Cell>
          <Table.Cell>{@render cls(p.job)}</Table.Cell><Table.Cell class="text-right" title={p.serverId ? `Server ${p.serverId}` : ""}>{serverName(p.serverId) || p.serverId || "—"}</Table.Cell><Table.Cell class="text-right">{gear(p.level ?? o?.level ?? null)}</Table.Cell>
          <Table.Cell class="text-right" title={p.gearScore == null && o ? "Item level, official profile" : ""}>{gear(p.gearScore ?? o?.itemLevel ?? null)}</Table.Cell>
          <Table.Cell class="text-right" title={p.combatPower == null && o ? "Official profile" : ""}>{gear(p.combatPower ?? o?.combatPower ?? null, short)}</Table.Cell><Table.Cell class="text-right">{short(p.dealt)}</Table.Cell><Table.Cell class="text-right">{short(p.taken)}</Table.Cell><Table.Cell class="text-right">{p.deaths}</Table.Cell></Table.Row>
          {#if player === pk}<Table.Row class="hover:bg-transparent"><Table.Cell colspan={9} class="whitespace-normal"><PlayerCard {p} /></Table.Cell></Table.Row>{/if}{/each}</Table.Body>
      </Table.Root></Table.Cell></Table.Row>{/if}
  {/each}</Table.Body></Table.Root><p class="hint">Deaths: your side : theirs. Click a match for its players.</p></Panel>{/if}

<Panel title="Kill history" count="{count('kill')} {count('kill') === 1 ? 'kill' : 'kills'} · {count('assist')} {count('assist') === 1 ? 'assist' : 'assists'} · {count('death')} {count('death') === 1 ? 'death' : 'deaths'}">
  <div class="mb-3"><UnderlineTabs label="Show" items={KILL_VIEWS} value={killView} onchange={(v) => { killView = v; killOpen = ""; }} /></div>
  {#if !kills.length}<p class="hint">{killView === "kill" ? "No kill yet." : killView === "assist" ? "No assist yet." : "Nobody has killed you yet."} PvP kills, assists and deaths are logged while the companion runs, anywhere.</p>
  {:else}<Table.Root>
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>When</Table.Head><Table.Head>Player</Table.Head><Table.Head>Class</Table.Head><Table.Head class="text-right">Server</Table.Head><Table.Head>Where</Table.Head>
      <Table.Head class="text-right">{killView === "death" ? "They dealt" : "You dealt"}</Table.Head><Table.Head class="text-right">{killView === "death" ? "You dealt" : "They dealt"}</Table.Head></Table.Row></Table.Header>
    <Table.Body>{#each kills as k (killKey(k))}{@const o = k.other}{@const kk = killKey(k)}
      <Table.Row class="cursor-pointer" tabindex={0} aria-expanded={killOpen === kk} title="Gear and stats" onclick={() => { killOpen = killOpen === kk ? "" : kk; }}>
        <Table.Cell class="text-muted-foreground">{when(k.atMs)}</Table.Cell>
        <Table.Cell class="font-medium">{o.name || `#${o.id}`}</Table.Cell>
        <Table.Cell>{@render cls(o.job)}</Table.Cell>
        <Table.Cell class="text-right">{serverName(o.serverId) || o.serverId || "—"}</Table.Cell>
        <Table.Cell>{#if k.mapId == null}<span class="text-muted-foreground" title="No map load since the app started: after the next teleport or zone change the map is known">Unknown</span>
          {:else}{mapLabel(log.maps, k.mapId)}{/if}</Table.Cell>
        <Table.Cell class="text-right">{short(killView === "death" ? o.dealt : o.taken)}</Table.Cell><Table.Cell class="text-right">{short(killView === "death" ? o.taken : o.dealt)}</Table.Cell></Table.Row>
      {#if killOpen === kk}<Table.Row class="hover:bg-transparent"><Table.Cell colspan={7} class="whitespace-normal"><PlayerCard p={o} /></Table.Cell></Table.Row>{/if}
    {/each}</Table.Body></Table.Root>
    <p class="hint">The killer is the last player who hit before the death (the game sends no "killed by"); an assist is your hit in the
      15 s before someone else's last one. Damage is since the map was loaded. "Unknown" map: the app started after you entered it,
      so the next teleport or zone change tells.</p>{/if}
  {#if unnamed.length}<div class="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-sm"><b>Name your maps</b>
    {#each unnamed as id (id)}<label class="flex items-center gap-1.5 text-muted-foreground">Map {id} <Input class="h-7 w-44" list="map-presets" placeholder="e.g. Lower Abyss" autocomplete="off"
      onchange={(e) => commit(e, (v) => labelMap(ui.data, id, v), () => log.maps[id] ?? "")} /></label>{/each}
    <datalist id="map-presets">{#each MAP_PRESETS as n}<option value={n}></option>{/each}</datalist>
    <span class="text-xs text-muted-foreground">Named once, every match and kill on that map shows it. Map ids are per game map, so a faction's whole world is one map.</span></div>{/if}
</Panel>
