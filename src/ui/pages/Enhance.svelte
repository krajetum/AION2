<script lang="ts">
  import { Input } from "$lib/components/ui/input/index.js";
  import { NativeSelect, NativeSelectOption } from "$lib/components/ui/native-select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  import { BASE_LEVEL, MAX_LEVEL, plan, SOURCES, VERIFIED } from "../../domain/enhance.ts";
  import { num } from "../format.ts";
  import Kpi from "../parts/Kpi.svelte";

  // Page state only: nothing here goes into the save file.
  let itemLevel = $state(BASE_LEVEL);
  let from = $state(0);
  let to = $state(MAX_LEVEL);
  let stonePrice = $state(0);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));
  const p = $derived(plan(clamp(itemLevel, 1, 999), from, to, Math.max(0, stonePrice || 0)));
  const short = (v: number) => (v >= 1e6 ? (v / 1e6).toFixed(v >= 1e8 ? 0 : 2) + "M" : num(Math.round(v)));
  const withStones = $derived(stonePrice > 0 ? "Kina + stones" : "Kina");
</script>

<div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
  <label class="flex items-center gap-1.5 text-muted-foreground">Item level <Input class="h-8 w-20" type="number" min="1" max="999" value={itemLevel} aria-label="Item level"
    onchange={(e) => { itemLevel = clamp(e.currentTarget.valueAsNumber, 1, 999); }} /></label>
  <label class="flex items-center gap-1.5 text-muted-foreground">From <NativeSelect value={from} onchange={(e) => { from = Number(e.currentTarget.value); if (to <= from) to = from + 1; }}>
    {#each Array.from({ length: MAX_LEVEL }, (_, i) => i) as n}<NativeSelectOption value={n}>+{n}</NativeSelectOption>{/each}</NativeSelect></label>
  <label class="flex items-center gap-1.5 text-muted-foreground">To <NativeSelect value={to} onchange={(e) => { to = Number(e.currentTarget.value); if (from >= to) from = to - 1; }}>
    {#each Array.from({ length: MAX_LEVEL }, (_, i) => i + 1) as n}<NativeSelectOption value={n}>+{n}</NativeSelectOption>{/each}</NativeSelect></label>
  <label class="flex items-center gap-1.5 text-muted-foreground" title="To count the Enhance Stones in Kina too: their market price, 0 = Kina only">Kina per Enhance Stone <Input class="h-8 w-28" type="number" min="0"
    value={stonePrice} aria-label="Kina per Enhance Stone" onchange={(e) => { stonePrice = Math.max(0, e.currentTarget.valueAsNumber || 0); }} /></label>
</div>
<p class="hint mb-3">Unique gear. Failing costs only the materials: the piece keeps its level. Each failure adds 5% to the next try at that step.</p>

<div class="mb-3 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
  <Kpi label="Expected Kina" value="≈ {short(p.kina)}" sub="{p.attempts.toFixed(1)} attempts on average" cls="hero" />
  <Kpi label="Expected Enhance Stones" value="≈ {short(p.stones)}" sub={stonePrice > 0 ? `≈ ${short(p.stones * stonePrice)} Kina` : "at your price, if you set one"} />
  <Kpi label="Lucky (10%)" value="≈ {short(p.lucky)}" sub="{withStones}: 1 run in 10 costs less" />
  <Kpi label="Typical (50%)" value="≈ {short(p.typical)}" sub="{withStones}: half the runs cost less" />
  <Kpi label="Unlucky (90%)" value="≈ {short(p.unlucky)}" sub="{withStones}: 1 run in 10 costs more" />
  <Kpi label="Worst case" value="≈ {short(p.worst)}" sub="{withStones}: every step at its last attempt" />
</div>

<Panel title="Steps" count={p.steps.length}>
  <Table.Root>
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Step</Table.Head><Table.Head class="text-right">Success</Table.Head><Table.Head class="text-right">Avg attempts</Table.Head><Table.Head class="text-right">Max attempts</Table.Head><Table.Head class="text-right">Kina / attempt</Table.Head><Table.Head class="text-right">Stones / attempt</Table.Head><Table.Head class="text-right">Expected Kina</Table.Head></Table.Row></Table.Header>
    <Table.Body>{#each p.steps as s (s.from)}<Table.Row>
      <Table.Cell>+{s.from} → +{s.from + 1}</Table.Cell>
      <Table.Cell class="text-right">{s.chance}%{#if s.chance < 100} <span class="text-muted-foreground">+5%/fail</span>{/if}</Table.Cell>
      <Table.Cell class="text-right">{s.avg.toFixed(2)}</Table.Cell><Table.Cell class="text-right">{s.max}</Table.Cell>
      <Table.Cell class="text-right">≈ {num(s.kina)}</Table.Cell><Table.Cell class="text-right">≈ {num(s.stones)}</Table.Cell><Table.Cell class="text-right">≈ {num(Math.round(s.kina * s.avg))}</Table.Cell>
    </Table.Row>{/each}</Table.Body>
  </Table.Root>
</Panel>

<p class="hint">Success chances: the Global client data and NCSOFT's Korean probability disclosure agree. Costs per attempt are those of an
  item level {BASE_LEVEL} Unique scaled by item level (within 1% of the sources' totals for item levels 36 to 102), so "≈".
  Checked {VERIFIED}:
  {#each SOURCES as src, i (src.url)}<a class="underline" href={src.url} target="_blank" rel="noreferrer">{src.name}</a>{i < SOURCES.length - 1 ? " · " : "."}{/each}</p>
