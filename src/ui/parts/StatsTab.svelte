<script lang="ts">
  // Players › Stats: the official profile's stats with what each gives, then "Stats from gear" (every piece's lines
  // added up, domain/gearstats.ts; a click lists the pieces that give it). Each stat with its icon (ui/icons.ts).
  import * as Table from "$lib/components/ui/table/index.js";
  import Fold from "$lib/components/app/Fold.svelte";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { gearStats, gearText } from "../../domain/gearstats.ts";
  import { num } from "../format.ts";
  import { statIcon } from "../icons.ts";
  import type { CharacterSheet } from "./sheet.svelte.ts";

  let { sheet }: { sheet: CharacterSheet } = $props();
  const stats = $derived(sheet.profile?.stats ?? []);
  const fromGear = $derived(gearStats(sheet.all.map((p) => ({ piece: p, detail: sheet.details[p.slot] }))));
  let shownStat = $state("");
</script>

{#if stats.length}<Table.Root>
  <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Stat</Table.Head><Table.Head class="text-right">Value</Table.Head><Table.Head>Gives</Table.Head></Table.Row></Table.Header>
  <Table.Body>{#each stats as s (s.name)}{@const I = statIcon(s.name)}<Table.Row>
    <Table.Cell><span class="inline-flex items-center gap-2"><I class="size-4 text-muted-foreground" />{s.name}</span></Table.Cell>
    <Table.Cell class="text-right tabular-nums">{num(s.value)}</Table.Cell>
    <Table.Cell class="whitespace-normal text-muted-foreground">{s.effects.join(" · ")}</Table.Cell></Table.Row>{/each}</Table.Body>
</Table.Root>{:else}<p class="hint">The official profile sent no stats.</p>{/if}

<div class="mt-4"><Fold title="Stats from gear" note={sheet.reading ? `reading ${sheet.reading.read} / ${sheet.reading.total} pieces…` : `${sheet.all.length} pieces`} open>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 text-sm">
    {#each fromGear as s (s.key)}{@const I = statIcon(s.name)}<div class="border-b">
      <button type="button" data-slot="fold" class="flex w-full items-center gap-1.5 py-1 text-left hover:text-foreground" aria-expanded={shownStat === s.key} onclick={() => { shownStat = shownStat === s.key ? "" : s.key; }}>
        <ChevronRight class="size-3 shrink-0 text-muted-foreground transition-transform {shownStat === s.key ? 'rotate-90' : ''}" /><I class="size-3.5 shrink-0 text-muted-foreground" /><span class="text-muted-foreground">{s.name}</span><span class="ml-auto tabular-nums">{gearText(s)}</span></button>
      {#if shownStat === s.key}<ul class="m-0 mb-1 list-none p-0 pl-4 text-xs text-muted-foreground">{#each s.by as b (b.slot)}<li class="flex justify-between gap-2"><span>{b.piece}</span><span class="tabular-nums">{gearText({ value: b.value, pct: s.pct })}</span></li>{/each}</ul>{/if}
    </div>{/each}
  </div>
  <p class="hint mb-0">Every piece's lines added up: main stats with their enchant, bonus lines, manastones and the arcana. Before the game's percentages (Might's Attack increase and the like), and without Daevanion, Genus, pets or titles: not the Stat Info total. Click a stat for the pieces that give it.</p>
</Fold></div>
