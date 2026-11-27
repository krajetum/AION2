<script lang="ts">
  // A character's Daevanion boards from the official site (infra/armory.ts): how far each is open, the stats and skill
  // levels all open nodes give together, then each board's own (its Board Effect in game). Boards as the sheet read them.
  import Fold from "$lib/components/app/Fold.svelte";
  import StatList from "$lib/components/app/StatList.svelte";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { addLines, type Board, type StatLine } from "../../domain/armory.ts";
  import Hexagon from "@lucide/svelte/icons/hexagon";

  // `read` = the boards read so far by id (the opened character's sheet), absent = not read yet.
  let { boards, read, failed = "" }: { boards: { id: number; name: string; open: number; total: number }[]; read: Record<number, Board | null>; failed?: string } = $props();
  const done = $derived(boards.filter((b) => read[b.id] !== undefined));
  const stats = $derived(addLines(done.map((b) => read[b.id]?.stats ?? [])));
  const skills = $derived(addLines(done.map((b) => read[b.id]?.skills ?? [])));
  const rows = (list: StatLine[]) => list.map((l) => ({ key: `${l.name}|${l.pct}`, name: l.name, value: `+${l.value}${l.pct ? "%" : ""}` }));
</script>

{#snippet lines(stats: StatLine[], skills: StatLine[])}
  {#if stats.length}<StatList rows={rows(stats)} />{/if}
  {#if skills.length}<p class="hint mb-1">Skill levels</p><StatList rows={rows(skills)} />{/if}
  {#if !stats.length && !skills.length}<p class="hint m-0">No node open.</p>{/if}
{/snippet}

<Fold title="Daevanion" note="{boards.reduce((n, b) => n + b.open, 0)} nodes open" open>
  <div class="mb-3 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
    {#each boards as b (b.name)}<div class="flex flex-col gap-0.5 rounded-xl border bg-card px-4 py-3">
      <span class="flex items-center gap-1.5 text-xs text-muted-foreground"><Hexagon class="size-3.5" />{b.name}</span>
      <span class="text-2xl font-semibold tabular-nums">{b.open} / {b.total}</span><Progress class="mt-1.5" value={b.total ? (b.open / b.total) * 100 : 0} /></div>{/each}</div>
  {#if failed}<p class="hint error">Some boards could not be read ({failed}).</p>{/if}
  <div class="flex flex-col gap-2">
    <Fold title="Total" note={done.length < boards.length ? `reading ${done.length} / ${boards.length} boards…` : `${boards.length} boards`} nested open>{@render lines(stats, skills)}</Fold>
    {#each boards as b (b.name)}<Fold title={b.name} note="{b.open} / {b.total}" nested>
      {#if read[b.id] === undefined}<p class="hint m-0">Reading…</p>{:else if read[b.id]}{@render lines(read[b.id]!.stats, read[b.id]!.skills)}{:else}<p class="hint m-0">Not read.</p>{/if}
    </Fold>{/each}
  </div>
</Fold>
