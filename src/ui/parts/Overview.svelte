<script lang="ts">
  // Players › Overview: the opened character at a glance: every piece (icon, slot, enchant, how many of its ideal lines
  // it has), pet and wings, and the official profile's stats with their icons.
  import { Progress } from "$lib/components/ui/progress/index.js";
  import PawPrint from "@lucide/svelte/icons/paw-print";
  import Feather from "@lucide/svelte/icons/feather";
  import type { Piece } from "../../domain/armory.ts";
  import { bisLines, bisSlot, checkBis, slotLabel } from "../../domain/bis.ts";
  import { num } from "../format.ts";
  import { slotIcon, statIcon } from "../icons.ts";
  import { ui } from "../state.svelte.ts";
  import { BIS, type CharacterSheet } from "./sheet.svelte.ts";

  let { sheet }: { sheet: CharacterSheet } = $props();
  const ideal = (p: Piece) => {
    const slot = bisSlot(p.slotName), lines = slot ? bisLines(BIS.classes, ui.data.bis, sheet.className, slot) : null;
    return lines && sheet.details[p.slot] ? checkBis(lines, sheet.details[p.slot] ?? null) : null;
  };
</script>

{#if sheet.eqError}<p class="hint">Equipment not read ({sheet.eqError}).</p>
{:else if !sheet.eq}<p class="hint">Reading the equipment…</p>
{:else}
  <div class="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2">
    {#each sheet.all as p (p.slot)}{@const slot = bisSlot(p.slotName)}{@const I = slotIcon(slot)}{@const c = ideal(p)}
      <div class="grade-edge-{p.grade} flex items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2" style="border-color: color-mix(in srgb, var(--edge, var(--border)) 45%, transparent)">
        <span class="relative grid size-10 shrink-0 place-items-center rounded-md bg-muted">
          {#if p.icon}<img src={p.icon} alt="" class="size-10 rounded-md" loading="lazy">{:else}<I class="size-5 text-muted-foreground" />{/if}
          {#if p.enchant}<span class="absolute -right-1.5 -bottom-1.5 rounded bg-[var(--gold)] px-1 text-[10px] leading-tight font-bold text-background">+{p.enchant}</span>{/if}
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate text-sm font-medium grade-{p.grade}" title={p.name}>{p.name}</span>
          <span class="flex items-center gap-1 text-xs text-muted-foreground"><I class="size-3" />{slot ? slotLabel(slot) : p.slotName}{#if p.exceed} · ◆{p.exceed}{/if}</span>
          {#if c}<span class="flex items-center gap-1.5 text-xs text-muted-foreground" title="{c.has} of {c.lines.length} ideal lines"><Progress class="h-1 flex-1" value={c.lines.length ? (c.has / c.lines.length) * 100 : 0} /><span class="tabular-nums">{c.has}/{c.lines.length}</span></span>
          {:else if sheet.details[p.slot] === undefined && !sheet.errors[p.slot]}<span class="text-xs text-muted-foreground">Reading…</span>{/if}
        </span>
      </div>{/each}
  </div>
  {#if sheet.eq.pet || sheet.eq.wing}<div class="mt-3 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2">
    {#if sheet.eq.pet}<div class="flex items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2">
      <span class="grid size-10 shrink-0 place-items-center rounded-md bg-muted">{#if sheet.eq.pet.icon}<img src={sheet.eq.pet.icon} alt="" class="size-10 rounded-md" loading="lazy">{:else}<PawPrint class="size-5 text-muted-foreground" />{/if}</span>
      <span class="flex flex-col"><span class="text-sm font-medium">{sheet.eq.pet.name}</span><span class="flex items-center gap-1 text-xs text-muted-foreground"><PawPrint class="size-3" />Pet{sheet.eq.pet.level != null ? ` · Lv ${sheet.eq.pet.level}` : ""}</span></span></div>{/if}
    {#if sheet.eq.wing}<div class="flex items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2">
      <span class="grid size-10 shrink-0 place-items-center rounded-md bg-muted">{#if sheet.eq.wing.icon}<img src={sheet.eq.wing.icon} alt="" class="size-10 rounded-md" loading="lazy">{:else}<Feather class="size-5 text-muted-foreground" />{/if}</span>
      <span class="flex flex-col"><span class="text-sm font-medium grade-{sheet.eq.wing.grade}">{sheet.eq.wing.name}</span><span class="flex items-center gap-1 text-xs text-muted-foreground"><Feather class="size-3" />Wings</span></span></div>{/if}
  </div>{/if}
{/if}
{#if sheet.profile?.stats?.length}<div class="mt-4 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
  {#each sheet.profile.stats as s (s.name)}{@const I = statIcon(s.name)}<div class="flex items-center gap-2 rounded-lg border bg-card px-3 py-2" title={s.effects.join(" · ")}>
    <I class="size-4 shrink-0 text-muted-foreground" /><span class="truncate text-xs text-muted-foreground">{s.name}</span><span class="ml-auto font-semibold tabular-nums">{num(s.value)}</span></div>{/each}
</div>{/if}
