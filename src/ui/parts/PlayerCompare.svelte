<script lang="ts">
  // Players › Compare: two characters side by side from their official profiles (domain/compare.ts): overview, stats,
  // stats from gear, Daevanion, equipment slot by slot, skill levels, and Genus when both are yours (read in game).
  // Δ = the first minus the second: green where the first is ahead.
  import { untrack } from "svelte";
  import Fold from "$lib/components/app/Fold.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import type { Board, Equipment, Found, ItemDetail, Profile } from "../../domain/armory.ts";
  import { boardRows, diffRows, diffText, gearRows, pieceLevel, pieceText, profileRows, skillRows, slotPairs, statRows, type DiffRow } from "../../domain/compare.ts";
  import { genusTotal, shownPreset, statName, isPct, type GenusRead } from "../../domain/genus.ts";
  import { boardOf, equipmentOf, itemOf, profileOf } from "../../infra/armory.ts";
  import { classIcon } from "../classes.ts";
  import { ui } from "../state.svelte.ts";

  let { a, b, onswap, onclose }: { a: Found; b: Found; onswap: () => void; onclose: () => void } = $props();

  type Side = { profile: Profile | null; eq: Equipment | null; details: Record<number, ItemDetail | null>; boards: Record<number, Board | null>; error: string };
  const empty = (): Side => ({ profile: null, eq: null, details: {}, boards: {}, error: "" });
  let A = $state<Side>(empty()), B = $state<Side>(empty());

  function load(c: Found, side: Side, live: () => boolean) {
    const fail = (e: unknown) => { if (live()) side.error = e instanceof Error ? e.message : String(e); };
    profileOf(c.characterId, c.serverId).then((p) => {
      if (!live()) return;
      side.profile = p;
      for (const bd of p?.boards ?? []) if (bd.id) boardOf(c.characterId, c.serverId, bd.id).then((v) => { if (live()) side.boards[bd.id] = v; }, fail);
    }, fail);
    equipmentOf(c.characterId, c.serverId).then((e) => {
      if (!live()) return;
      side.eq = e;
      for (const p of e ? [...e.gear, ...e.accessories, ...e.arcana] : []) itemOf(p, c.characterId, c.serverId).then((d) => { if (live()) side.details[p.slot] = d; }, fail);
    }, fail);
  }
  $effect(() => {
    const x = a, y = b;
    let alive = true;
    // Only a and b count: reading the sides here would rerun this on every answer.
    untrack(() => {
      A = empty(); B = empty();
      load(x, A, () => alive);
      load(y, B, () => alive);
    });
    return () => { alive = false; };
  });

  const pieces = (s: Side) => (s.eq ? [...s.eq.gear, ...s.eq.accessories, ...s.eq.arcana].map((p) => ({ piece: p, detail: s.details[p.slot] })) : []);
  const piecesRead = (s: Side) => pieces(s).filter((p) => p.detail !== undefined).length;
  const boardsOf = (s: Side) => (s.profile?.boards ?? []).map((bd) => s.boards[bd.id] ?? null);
  const ready = $derived(!!A.profile && !!B.profile);
  // Genus: only characters of yours, read in game (kept by name).
  const genusOf = (name: string): GenusRead | null => ui.data.genus?.[name] ?? Object.entries(ui.data.genus ?? {}).find(([n]) => n.toLowerCase() === name.toLowerCase())?.[1] ?? null;
  const gA = $derived(genusOf(a.name)), gB = $derived(genusOf(b.name));
  const genusRows = $derived(gA && gB ? diffRows(
    genusTotal(gA, shownPreset(gA)).map((r) => ({ key: String(r.stat), name: statName(r.stat), value: isPct(r.stat) ? r.value / 100 : r.value, pct: isPct(r.stat) })),
    genusTotal(gB, shownPreset(gB)).map((r) => ({ key: String(r.stat), name: statName(r.stat), value: isPct(r.stat) ? r.value / 100 : r.value, pct: isPct(r.stat) }))) : []);
  const val = (v: number | null, pct: boolean) => (v == null ? "—" : pct ? `${Math.round(v * 100) / 100}%` : v.toLocaleString("en-US"));
  const tone = (d: number) => (d > 0 ? "text-[var(--ok-ink)]" : d < 0 ? "text-[var(--negative)]" : "text-muted-foreground");
</script>

{#snippet who(c: Found, s: Side)}<span class="inline-flex items-center gap-1.5">{#if s.profile && classIcon(s.profile.className)}<img class="size-5 object-contain" src={classIcon(s.profile.className)} alt="">{/if}{c.name}
  <span class="text-xs font-normal text-muted-foreground">{c.serverName}</span></span>{/snippet}

{#snippet rows(list: DiffRow[], empty = "Nothing to compare.")}
  {#if list.length}<Table.Root>
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head></Table.Head><Table.Head class="text-right">{a.name}</Table.Head><Table.Head class="text-right">{b.name}</Table.Head><Table.Head class="text-right">Δ</Table.Head></Table.Row></Table.Header>
    <Table.Body>{#each list as r (r.key)}<Table.Row>
      <Table.Cell>{r.name}</Table.Cell><Table.Cell class="text-right tabular-nums">{val(r.a, r.pct)}</Table.Cell><Table.Cell class="text-right tabular-nums">{val(r.b, r.pct)}</Table.Cell>
      <Table.Cell class="text-right tabular-nums {tone(r.diff)}">{diffText(r)}</Table.Cell></Table.Row>{/each}</Table.Body>
  </Table.Root>{:else}<p class="hint m-0">{empty}</p>{/if}
{/snippet}

<div class="mb-3 flex flex-col gap-2">
  <div class="flex flex-wrap items-center gap-2 text-sm font-semibold">
    {@render who(a, A)}<span class="text-muted-foreground">vs</span>{@render who(b, B)}
    <span class="ml-auto flex gap-2"><Button size="sm" variant="outline" onclick={onswap}>Swap</Button><Button size="sm" variant="ghost" onclick={onclose}>Close compare</Button></span>
  </div>
  <p class="hint m-0">Δ = {a.name} minus {b.name}: green where {a.name} is ahead.</p>
  {#if A.error || B.error}<p class="hint error m-0">Some of it could not be read ({A.error || B.error}).</p>{/if}
  {#if !ready}<p class="hint m-0">Reading both profiles…</p>
  {:else}
    <Fold title="Overview" open>{@render rows(profileRows(A.profile!, B.profile!))}</Fold>
    <Fold title="Stats" note="primary and god stats" open>{@render rows(statRows(A.profile!, B.profile!))}</Fold>
    <Fold title="Stats from gear" note={piecesRead(A) < pieces(A).length || piecesRead(B) < pieces(B).length ? `reading pieces ${piecesRead(A) + piecesRead(B)} / ${pieces(A).length + pieces(B).length}…` : "every piece's lines added up"} open>
      {@render rows(gearRows(pieces(A), pieces(B)))}</Fold>
    <Fold title="Daevanion" note="all boards added up">
      {@render rows(boardRows(boardsOf(A), boardsOf(B)))}
      <p class="hint mb-1">Skill levels from the boards</p>{@render rows(boardRows(boardsOf(A), boardsOf(B), "skills"))}</Fold>
    {#if A.eq && B.eq}
      <Fold title="Equipment" note="slot by slot, Δ = enchant levels">
        <Table.Root>
          <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Slot</Table.Head><Table.Head>{a.name}</Table.Head><Table.Head>{b.name}</Table.Head><Table.Head class="text-right">Δ</Table.Head></Table.Row></Table.Header>
          <Table.Body>{#each slotPairs(A.eq, B.eq) as s (s.slot)}{@const d = pieceLevel(s.a) - pieceLevel(s.b)}<Table.Row>
            <Table.Cell class="text-muted-foreground">{s.slot}</Table.Cell>
            <Table.Cell class="whitespace-normal {s.a ? `grade-${s.a.grade}` : ''}">{pieceText(s.a)}</Table.Cell>
            <Table.Cell class="whitespace-normal {s.b ? `grade-${s.b.grade}` : ''}">{pieceText(s.b)}</Table.Cell>
            <Table.Cell class="text-right tabular-nums {tone(d)}">{d ? (d > 0 ? `+${d}` : `−${-d}`) : ""}</Table.Cell></Table.Row>{/each}</Table.Body>
        </Table.Root>
      </Fold>
      <Fold title="Skills" note="levels, 0 = not learned">
        {#if A.profile!.className !== B.profile!.className}<p class="hint mt-0">{A.profile!.className} and {B.profile!.className}: different classes, different skills.</p>{/if}
        {@render rows(skillRows(A.eq, B.eq))}</Fold>
    {/if}
    {#if gA && gB}<Fold title="Genus Insight" note="both yours, as read in game">{@render rows(genusRows)}</Fold>
    {:else}<p class="hint m-0">Genus Insight: only between your own characters (the game sends no one else's).</p>{/if}
  {/if}
</div>
