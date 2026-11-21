<script lang="ts">
  // A player clicked in a boss fight: advanced stats, every skill (damage, hits, casts, crit), buffs with their uptime.
  import * as Table from "$lib/components/ui/table/index.js";
  import { short, skillIconUrl, type PlayerRow } from "../../domain/meter.ts";
  import BuffList from "./BuffList.svelte";
  import PlayerStats from "./PlayerStats.svelte";

  let { row, ms, noSkills = "No skill breakdown for this player in this fight." }: { row: PlayerRow; ms: number; noSkills?: string } = $props();
  const sec = $derived(Math.max(1, ms / 1000));
</script>

<PlayerStats {row} {ms} />

<h3 class="mt-2.5 mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Skills</h3>
{#if row.skills.length}<Table.Root>
  <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Skill</Table.Head><Table.Head class="text-right">Damage</Table.Head><Table.Head class="text-right">DPS</Table.Head><Table.Head class="text-right">Share</Table.Head><Table.Head class="text-right">Hits</Table.Head>
    <Table.Head class="text-right" title="Times used: a hit more than 400 ms after the last one of that skill">Used</Table.Head><Table.Head class="text-right">Crit</Table.Head><Table.Head class="text-right">Avg hit</Table.Head></Table.Row></Table.Header>
  <Table.Body>{#each row.skills as s (s.name)}<Table.Row>
    <Table.Cell><span class="flex items-center gap-2">{#if s.icon}<img class="size-5 rounded" src={skillIconUrl(s.icon)} alt="" loading="lazy">{:else}<span class="size-5 rounded bg-secondary" aria-hidden="true"></span>{/if}{s.name}{#if s.dot}<span class="text-xs text-muted-foreground">DoT</span>{/if}</span></Table.Cell>
    <Table.Cell class="text-right">{short(s.damage)}</Table.Cell><Table.Cell class="text-right">{short(s.damage / sec)}/s</Table.Cell><Table.Cell class="text-right">{(s.share * 100).toFixed(1)}%</Table.Cell><Table.Cell class="text-right">{s.hits}</Table.Cell>
    <Table.Cell class="text-right">{s.dot || s.casts == null ? "–" : s.casts}</Table.Cell><Table.Cell class="text-right">{s.dot ? "–" : Math.round(s.critRate * 100) + "%"}</Table.Cell>
    <Table.Cell class="text-right">{s.hits ? short(s.damage / s.hits) : "–"}</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
{:else}<p class="hint">{noSkills}</p>{/if}

<BuffList {row} {ms} />
