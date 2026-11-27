<script lang="ts">
  // Players › Compare: two characters' official profiles (two CharacterSheets, each read once) as rows: the profile's
  // numbers, every gear / accessory / arcana slot with both pieces, pet and wings, Daevanion, skills, and Genus when
  // both are yours (read in game). Δ = the left minus the right: green where the left is ahead. Swap only swaps the
  // columns here: the header and the other tabs keep the opened character.
  import type { Component } from "svelte";
  import Fold from "$lib/components/app/Fold.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import ArrowLeftRight from "@lucide/svelte/icons/arrow-left-right";
  import UserSearch from "@lucide/svelte/icons/user-search";
  import UserIcon from "@lucide/svelte/icons/user";
  import PawPrint from "@lucide/svelte/icons/paw-print";
  import Feather from "@lucide/svelte/icons/feather";
  import Hexagon from "@lucide/svelte/icons/hexagon";
  import Zap from "@lucide/svelte/icons/zap";
  import ChartColumn from "@lucide/svelte/icons/chart-column";
  import Gauge from "@lucide/svelte/icons/gauge";
  import Brain from "@lucide/svelte/icons/brain";
  import type { Piece } from "../../domain/armory.ts";
  import { bisLines, bisSlot, checkBis, slotLabel } from "../../domain/bis.ts";
  import { boardRows, diffRows, diffText, gearRows, pieceLevel, pieceText, profileRows, skillRows, slotPairs, statRows, type DiffRow } from "../../domain/compare.ts";
  import { genusTotal, shownPreset, statName, isPct, type GenusRead } from "../../domain/genus.ts";
  import { classIcon } from "../classes.ts";
  import { slotIcon, statIcon } from "../icons.ts";
  import { ui } from "../state.svelte.ts";
  import { BIS, type CharacterSheet } from "./sheet.svelte.ts";

  let { a, b, onother, onretry }: { a: CharacterSheet; b: CharacterSheet | null; onother: () => void; onretry: () => void } = $props();
  let swapped = $state(false);
  const L = $derived(swapped && b ? b : a), R = $derived(swapped && b ? a : b);

  const pieces = (s: CharacterSheet) => s.all.map((p) => ({ piece: p, detail: s.details[p.slot] }));
  const boardsOf = (s: CharacterSheet) => (s.profile?.boards ?? []).map((bd) => s.boards[bd.id] ?? null);
  const ready = $derived(!!L.profile && !!R?.profile);
  // Genus: only characters of yours, read in game (kept by name).
  const genusOf = (name: string): GenusRead | null => ui.data.genus?.[name] ?? Object.entries(ui.data.genus ?? {}).find(([n]) => n.toLowerCase() === name.toLowerCase())?.[1] ?? null;
  const genusList = (g: GenusRead) => genusTotal(g, shownPreset(g)).map((r) => ({ key: String(r.stat), name: statName(r.stat), value: isPct(r.stat) ? r.value / 100 : r.value, pct: isPct(r.stat) }));
  const gL = $derived(genusOf(L.found.name)), gR = $derived(R ? genusOf(R.found.name) : null);
  const ideal = (s: CharacterSheet, p: Piece | null) => {
    const slot = p && bisSlot(p.slotName), lines = slot ? bisLines(BIS.classes, ui.data.bis, s.className, slot) : null;
    return p && lines && s.details[p.slot] ? checkBis(lines, s.details[p.slot] ?? null) : null;
  };
  const val = (v: number | null, pct: boolean) => (v == null ? "—" : pct ? `${Math.round(v * 100) / 100}%` : v.toLocaleString("en-US"));
  const tone = (d: number) => (d > 0 ? "text-[var(--ok-ink)]" : d < 0 ? "text-[var(--negative)]" : "text-muted-foreground");
  const reading = (s: CharacterSheet) => (s.reading ? ` · reading ${s.reading.read} / ${s.reading.total}` : "");
</script>

{#snippet who(s: CharacterSheet)}<span class="inline-flex min-w-0 items-center gap-1.5">
  <span class="grid size-7 shrink-0 place-items-center rounded-md bg-muted">{#if s.profile && classIcon(s.profile.className)}<img class="size-5 object-contain" src={classIcon(s.profile.className)} alt="">{:else}<UserIcon class="size-4 text-muted-foreground" />{/if}</span>
  <span class="truncate">{s.found.name}</span><span class="text-xs font-normal text-muted-foreground">{s.found.serverName}</span></span>{/snippet}

{#snippet head(first = "")}<Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>{first}</Table.Head>
  <Table.Head class="text-right">{L.found.name}</Table.Head><Table.Head class="text-right">{R?.found.name}</Table.Head><Table.Head class="w-16 text-right">Δ</Table.Head></Table.Row></Table.Header>{/snippet}

{#snippet rows(list: DiffRow[], icon: ((name: string) => Component) | null = null, empty = "Nothing to compare.")}
  {#if list.length}<Table.Root>{@render head()}
    <Table.Body>{#each list as r (r.key)}{@const I = icon?.(r.name)}<Table.Row>
      <Table.Cell><span class="inline-flex items-center gap-2">{#if I}<I class="size-4 text-muted-foreground" />{/if}{r.name}</span></Table.Cell>
      <Table.Cell class="text-right tabular-nums">{val(r.a, r.pct)}</Table.Cell><Table.Cell class="text-right tabular-nums">{val(r.b, r.pct)}</Table.Cell>
      <Table.Cell class="text-right tabular-nums {tone(r.diff)}">{diffText(r)}</Table.Cell></Table.Row>{/each}</Table.Body>
  </Table.Root>{:else}<p class="hint m-0">{empty}</p>{/if}
{/snippet}

{#snippet side(s: CharacterSheet, p: Piece | null)}{@const c = ideal(s, p)}
  {#if p}<span class="inline-flex min-w-0 items-center gap-2">
    <span class="relative grid size-8 shrink-0 place-items-center rounded-md bg-muted">{#if p.icon}<img src={p.icon} alt="" class="size-8 rounded-md" loading="lazy">{:else}{@const I = slotIcon(bisSlot(p.slotName))}<I class="size-4 text-muted-foreground" />{/if}</span>
    <span class="flex min-w-0 flex-col"><span class="truncate grade-{p.grade}" title={p.name}>{pieceText(p)}</span>
      {#if c}<span class="text-xs text-muted-foreground">{c.has} / {c.lines.length} ideal lines</span>{:else if s.details[p.slot] === undefined && !s.errors[p.slot]}<span class="text-xs text-muted-foreground">Reading…</span>{/if}</span></span>
  {:else}<span class="text-muted-foreground">—</span>{/if}
{/snippet}

<div class="flex flex-col gap-3">
  <div class="flex flex-wrap items-center gap-2 text-sm font-semibold">
    {@render who(L)}
    {#if R}<span class="text-muted-foreground">vs</span>{@render who(R)}{/if}
    <span class="ml-auto flex gap-2">
      {#if R}<Button size="sm" variant="outline" onclick={() => { swapped = !swapped; }}><ArrowLeftRight />Swap</Button>{/if}
      <Button size="sm" variant="outline" onclick={onother}><UserSearch />Other</Button></span>
  </div>
  {#if !R}<p class="hint m-0">Pick a character to compare with: Other, then search and open them.</p>
  {:else}
    <p class="hint m-0">Δ = {L.found.name} minus {R.found.name}: green where {L.found.name} is ahead.</p>
    {#if b?.error}<p class="hint error m-0">{b.found.name}'s profile could not be read ({b.error}). <Button variant="link" size="sm" class="px-1" onclick={onretry}>Try again</Button></p>
    {:else if !ready}<p class="hint m-0">Reading both profiles…</p>
    {:else}
      {@render rows(profileRows(L.profile!, R.profile!), (n) => (n === "Combat power" ? Gauge : n === "Item level" ? ChartColumn : UserIcon))}
      {#if L.eq && R.eq}
        <Table.Root>{@render head(`Equipment${reading(L) || reading(R)}`)}
          <Table.Body>{#each slotPairs(L.eq, R.eq) as s (s.slot)}{@const slot = bisSlot(s.slot)}{@const I = slotIcon(slot)}{@const d = pieceLevel(s.a) - pieceLevel(s.b)}<Table.Row>
            <Table.Cell class="text-muted-foreground"><span class="inline-flex items-center gap-2"><I class="size-4" />{slot ? slotLabel(slot) : s.slot}</span></Table.Cell>
            <Table.Cell class="max-w-56 whitespace-normal">{@render side(L, s.a)}</Table.Cell>
            <Table.Cell class="max-w-56 whitespace-normal">{@render side(R, s.b)}</Table.Cell>
            <Table.Cell class="text-right tabular-nums {tone(d)}">{d ? (d > 0 ? `+${d}` : `−${-d}`) : ""}</Table.Cell></Table.Row>{/each}
            <Table.Row><Table.Cell class="text-muted-foreground"><span class="inline-flex items-center gap-2"><PawPrint class="size-4" />Pet</span></Table.Cell>
              {#each [L.eq, R.eq] as e}<Table.Cell>{#if e.pet}{e.pet.name}{e.pet.level != null ? ` · Lv ${e.pet.level}` : ""}{:else}<span class="text-muted-foreground">—</span>{/if}</Table.Cell>{/each}
              <Table.Cell class="text-right tabular-nums {tone((L.eq.pet?.level ?? 0) - (R.eq.pet?.level ?? 0))}">{diffText({ diff: (L.eq.pet?.level ?? 0) - (R.eq.pet?.level ?? 0), pct: false })}</Table.Cell></Table.Row>
            <Table.Row><Table.Cell class="text-muted-foreground"><span class="inline-flex items-center gap-2"><Feather class="size-4" />Wings</span></Table.Cell>
              {#each [L.eq, R.eq] as e}<Table.Cell>{#if e.wing}<span class="grade-{e.wing.grade}">{e.wing.name}</span>{:else}<span class="text-muted-foreground">—</span>{/if}</Table.Cell>{/each}<Table.Cell></Table.Cell></Table.Row>
          </Table.Body>
        </Table.Root>
      {/if}
      <Fold title="Daevanion" note="all boards added up">
        {@render rows(boardRows(boardsOf(L), boardsOf(R)), () => Hexagon)}
        <p class="hint mb-1">Skill levels from the boards</p>{@render rows(boardRows(boardsOf(L), boardsOf(R), "skills"), () => Zap)}</Fold>
      {#if L.eq && R.eq}<Fold title="Skills" note="levels, 0 = not learned">
        {#if L.className !== R.className}<p class="hint mt-0">{L.className} and {R.className}: different classes, different skills.</p>{/if}
        {@render rows(skillRows(L.eq, R.eq), () => Zap)}</Fold>{/if}
      <Fold title="Stats" note="primary and god stats">{@render rows(statRows(L.profile!, R.profile!), statIcon)}</Fold>
      <Fold title="Stats from gear" note="every piece's lines added up{reading(L) || reading(R)}">{@render rows(gearRows(pieces(L), pieces(R)), statIcon)}</Fold>
      {#if gL && gR}<Fold title="Genus Insight" note="both yours, as read in game">{@render rows(diffRows(genusList(gL), genusList(gR)), () => Brain)}</Fold>
      {:else}<p class="hint m-0">Genus Insight: only between your own characters (the game sends no one else's).</p>{/if}
    {/if}
  {/if}
</div>
