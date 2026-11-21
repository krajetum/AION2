<script lang="ts">
  // Your Genus Insight as the meter read it in game (domain/genus.ts): the preset shown, its total, then each insight's
  // lines in the game's colours. Only your own characters: the game sends no one else's, and the official site has none.
  import Fold from "$lib/components/app/Fold.svelte";
  import StatList from "$lib/components/app/StatList.svelte";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { genusTotal, linesIn, shownPreset, statName, statText, type GenusRead } from "../../domain/genus.ts";
  import { hm } from "../format.ts";

  let { g }: { g: GenusRead } = $props();
  let picked = $state("");
  const shown = $derived(Number(picked) || shownPreset(g));
  const total = $derived(genusTotal(g, shown));
  const insights = $derived(linesIn(g, shown));
  const filled = $derived([1, 2, 3].filter((p) => g.insights.some((i) => i.presets[p - 1]?.length)));
  // The insight pages' colours by line grade: white, green, blue, gold, orange.
  const GRADE = ["", "text-foreground", "text-[var(--ok-ink)]", "text-[var(--grade-legend)]", "text-[var(--star)]", "text-[var(--grade-unique)]"];
</script>

<Fold title="Genus Insight" note="preset {shown}{g.preset === shown ? ' (in use)' : ''} · read in game {hm(g.atMs)}" open>
  {#if filled.length > 1}<ToggleGroup.Root type="single" variant="outline" size="sm" class="mb-2" value={String(shown)} onValueChange={(v) => { if (v) picked = v; }}>
    {#each filled as p}<ToggleGroup.Item value={String(p)}>Preset {p}</ToggleGroup.Item>{/each}</ToggleGroup.Root>{/if}
  <div class="flex flex-col gap-2">
    <Fold title="Total" note="{insights.reduce((n, i) => n + i.lines.length, 0)} lines" nested open>
      {#if total.length}<StatList rows={total.map((r) => ({ key: r.stat, name: statName(r.stat), value: statText(r.stat, r.value) }))} />
      {:else}<p class="hint m-0">No line rolled in this preset.</p>{/if}
    </Fold>
    {#each insights as i (i.id)}<Fold title={i.name} note="Lv {i.level}{i.level >= 10 ? ' (max)' : ''} · {i.lines.length} lines" nested>
      {#if i.lines.length}<StatList rows={i.lines.map((l) => ({ key: l.slot, name: statName(l.stat), value: statText(l.stat, l.value), cls: GRADE[l.grade] }))} />
      {:else}<p class="hint m-0">No line rolled.</p>{/if}
    </Fold>{/each}
  </div>
  <p class="hint mb-0">Read from the game when you enter the world with the meter running; a preset switch in game is followed. "Stat #…" = a stat not identified yet.</p>
</Fold>
