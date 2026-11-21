<script lang="ts">
  // Two fights side by side: DPS, time, combat power, then the played character's skills per second (compareSkills).
  // Fight Log: two of your runs (Before / After); Guild page: two members' runs (their names).
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  import { compareSkills, yourDps, type FightRecord } from "../../domain/fights.ts";
  import { clock, short, skillIconUrl } from "../../domain/meter.ts";

  let { a, b, title, labelA = "Before", labelB = "After", dpsLabel = "Your DPS", onclear }:
    { a: FightRecord; b: FightRecord; title: string; labelA?: string; labelB?: string; dpsLabel?: string; onclear: () => void } = $props();
  const diff = $derived(compareSkills(a, b));
  const pct = (x: number, y: number) => (x ? `${y >= x ? "+" : ""}${Math.round((y / x - 1) * 100)}%` : "new");
  const tone = (up: boolean) => (up ? "text-right text-hps" : "text-right text-taken");
</script>

<Panel {title}>
  {#snippet actions()}<Button variant="ghost" size="sm" onclick={onclear}>Clear</Button>{/snippet}
  <Table.Root>
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head></Table.Head><Table.Head class="text-right">{labelA}</Table.Head><Table.Head class="text-right">{labelB}</Table.Head><Table.Head class="text-right">Change</Table.Head></Table.Row></Table.Header>
    <Table.Body>
      <Table.Row><Table.Cell>{dpsLabel}</Table.Cell><Table.Cell class="text-right">{short(yourDps(a))}/s</Table.Cell><Table.Cell class="text-right">{short(yourDps(b))}/s</Table.Cell><Table.Cell class={tone(yourDps(b) >= yourDps(a))}>{pct(yourDps(a), yourDps(b))}</Table.Cell></Table.Row>
      <Table.Row><Table.Cell>Time</Table.Cell><Table.Cell class="text-right">{clock(a.battleTimeMs)}</Table.Cell><Table.Cell class="text-right">{clock(b.battleTimeMs)}</Table.Cell><Table.Cell class={tone(b.battleTimeMs <= a.battleTimeMs)}>{pct(a.battleTimeMs, b.battleTimeMs)}</Table.Cell></Table.Row>
      <Table.Row><Table.Cell>Combat power</Table.Cell><Table.Cell class="text-right">{a.combatPower ? short(a.combatPower) : "—"}</Table.Cell><Table.Cell class="text-right">{b.combatPower ? short(b.combatPower) : "—"}</Table.Cell><Table.Cell></Table.Cell></Table.Row>
    </Table.Body></Table.Root>
  {#if diff.length}<Table.Root class="mt-3">
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Skill</Table.Head><Table.Head class="text-right">{labelA} /s</Table.Head><Table.Head class="text-right">{labelB} /s</Table.Head><Table.Head class="text-right">Change</Table.Head><Table.Head class="text-right">Hits</Table.Head><Table.Head class="text-right">Crit</Table.Head></Table.Row></Table.Header>
    <Table.Body>{#each diff as d (d.name)}<Table.Row>
      <Table.Cell><span class="flex items-center gap-2">{#if d.icon}<img class="size-5 rounded" src={skillIconUrl(d.icon)} alt="" loading="lazy">{:else}<span class="size-5 rounded bg-secondary" aria-hidden="true"></span>{/if}{d.name}{#if d.dot}<span class="text-xs text-muted-foreground">DoT</span>{/if}</span></Table.Cell>
      <Table.Cell class="text-right">{short(d.dpsA)}</Table.Cell><Table.Cell class="text-right">{short(d.dpsB)}</Table.Cell><Table.Cell class={tone(d.dpsB >= d.dpsA)}>{pct(d.dpsA, d.dpsB)}</Table.Cell>
      <Table.Cell class="text-right">{d.a?.hits ?? 0} → {d.b?.hits ?? 0}</Table.Cell>
      <Table.Cell class="text-right">{d.dot ? "–" : `${Math.round((d.a?.critRate ?? 0) * 100)}% → ${Math.round((d.b?.critRate ?? 0) * 100)}%`}</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
  {:else}<p class="hint">No skill data in these fights.</p>{/if}
</Panel>
