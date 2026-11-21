<script lang="ts">
  // A character's Daevanion boards from the official site (infra/armory.ts): how far each is open, the stats and skill
  // levels all open nodes give together, then each board's own (its Board Effect in game). Read board by board.
  import Fold from "$lib/components/app/Fold.svelte";
  import StatList from "$lib/components/app/StatList.svelte";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { addLines, type Board, type StatLine } from "../../domain/armory.ts";
  import { boardOf } from "../../infra/armory.ts";
  import Kpi from "./Kpi.svelte";

  let { characterId, serverId, boards }: { characterId: string; serverId: number; boards: { id: number; name: string; open: number; total: number }[] } = $props();
  let read = $state<Record<number, Board | null>>({}), failed = $state("");
  $effect(() => {
    const id = characterId, server = serverId, list = boards;
    let live = true;
    read = {}; failed = "";
    for (const b of list) if (b.id) boardOf(id, server, b.id).then((v) => { if (live) read[b.id] = v; },
      (e) => { if (live) failed = e instanceof Error ? e.message : String(e); });
    return () => { live = false; };
  });
  const done = $derived(boards.filter((b) => b.id in read));
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
    {#each boards as b (b.name)}<Kpi label={b.name} value="{b.open} / {b.total}"><Progress class="mt-1.5" value={b.total ? (b.open / b.total) * 100 : 0} /></Kpi>{/each}</div>
  {#if failed}<p class="hint error">Some boards could not be read ({failed}).</p>{/if}
  <div class="flex flex-col gap-2">
    <Fold title="Total" note={done.length < boards.length ? `reading ${done.length} / ${boards.length} boards…` : `${boards.length} boards`} nested open>{@render lines(stats, skills)}</Fold>
    {#each boards as b (b.name)}<Fold title={b.name} note="{b.open} / {b.total}" nested>
      {#if !(b.id in read)}<p class="hint m-0">Reading…</p>{:else if read[b.id]}{@render lines(read[b.id]!.stats, read[b.id]!.skills)}{:else}<p class="hint m-0">Not read.</p>{/if}
    </Fold>{/each}
  </div>
</Fold>
