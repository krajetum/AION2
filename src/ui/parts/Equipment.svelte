<script lang="ts">
  // A character's equipment from the official profile (infra/armory.ts), as cards: gear, accessories and arcana
  // (`GearCard`: the piece's lines, and its best-in-slot lines for the class behind a BiS button), pet and wings,
  // skills and stigma. Each piece's details are read one after another (the request queue spaces them).
  import type { Piece, Skill } from "../../domain/armory.ts";
  import { bisLines, bisSlot, type BisLine } from "../../domain/bis.ts";
  import { setBis } from "../../app/bis.ts";
  import { gearStats, gearText } from "../../domain/gearstats.ts";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Fold from "$lib/components/app/Fold.svelte";
  import { act } from "../actions.ts";
  import { ui } from "../state.svelte.ts";
  import GearCard from "./GearCard.svelte";
  import { BIS, type CharacterSheet } from "./sheet.svelte.ts";

  let { sheet }: { sheet: CharacterSheet } = $props();
  const eq = $derived(sheet.eq), details = $derived(sheet.details), errors = $derived(sheet.errors), className = $derived(sheet.className);
  const all = $derived(sheet.all);
  const fromGear = $derived(gearStats(all.map((p) => ({ piece: p, detail: details[p.slot] }))));
  const readCount = $derived(all.filter((p) => details[p.slot] !== undefined || errors[p.slot] !== undefined).length);
  let shownStat = $state("");
  const linesOf = (slot: string | null) => (slot ? bisLines(BIS.classes, ui.data.bis, className, slot) : null);
  const customOf = (slot: string | null) => !!slot && !!ui.data.bis[className]?.[slot];
  const saveOf = (slot: string | null) => (lines: BisLine[] | null) => { if (slot) act(() => setBis(ui.data, className, slot, lines)); };
</script>

{#snippet cards(list: Piece[])}<div class="gcards">{#each list as p (p.slot)}{@const slot = bisSlot(p.slotName)}
  <GearCard {p} {slot} detail={details[p.slot]} failed={errors[p.slot] ?? ""}
    lines={linesOf(slot)} custom={customOf(slot)} {className} save={saveOf(slot)} />{/each}</div>{/snippet}

{#snippet skills(title: string, list: Skill[], stigma = false)}
  {#if list.length}<h3 class="mt-4 mb-2 text-sm font-semibold">{title}</h3><div class="eq-skills">
    {#each list as s (s.id)}<span class="eq-skill" class:locked={s.level === 0} title="{s.name}{s.level ? ` · level ${s.level}` : ' · not learned'}{stigma && s.equipped ? ' · equipped' : ''}">
      {#if s.icon}<img src={s.icon} alt="" width="40" height="40" loading="lazy">{/if}
      {#if stigma && s.equipped}<i class="eq-e">E</i>{/if}{#if s.level}<small>Lv {s.level}</small>{:else}<small>🔒</small>{/if}</span>{/each}
  </div>{/if}
{/snippet}
{#if sheet.eqError}<p class="hint">Equipment not read ({sheet.eqError}).</p>
{:else if !eq}<p class="hint">Reading the equipment…</p>
{:else if eq}
  <h3 class="mt-4 mb-2 text-sm font-semibold">Gear</h3>{@render cards(eq.gear)}
  <h3 class="mt-4 mb-2 text-sm font-semibold">Accessories</h3>{@render cards(eq.accessories)}
  <h3 class="mt-4 mb-2 text-sm font-semibold">Arcana</h3>{#if eq.arcana.length}{@render cards(eq.arcana)}{:else}<p class="hint">No arcana equipped: the official profile lists none for this character.</p>{/if}
  <p class="hint">Best-in-slot lines from <a class="underline" href={BIS.sourceUrl} target="_blank" rel="noopener">{BIS.source}</a> ({BIS.captured}), with its % per line; Edit on a card's back keeps your own list.</p>
  <div class="mt-4"><Fold title="Stats from gear" note={readCount < all.length ? `reading ${readCount} / ${all.length} pieces…` : `${all.length} pieces`} open>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 text-sm">
      {#each fromGear as s (s.key)}<div class="border-b">
        <button type="button" data-slot="fold" class="flex w-full items-center gap-1 py-1 text-left hover:text-foreground" aria-expanded={shownStat === s.key} onclick={() => { shownStat = shownStat === s.key ? "" : s.key; }}>
          <ChevronRight class="size-3 shrink-0 text-muted-foreground transition-transform {shownStat === s.key ? 'rotate-90' : ''}" /><span class="text-muted-foreground">{s.name}</span><span class="ml-auto tabular-nums">{gearText(s)}</span></button>
        {#if shownStat === s.key}<ul class="m-0 mb-1 list-none p-0 pl-4 text-xs text-muted-foreground">{#each s.by as b (b.slot)}<li class="flex justify-between gap-2"><span>{b.piece}</span><span class="tabular-nums">{gearText({ value: b.value, pct: s.pct })}</span></li>{/each}</ul>{/if}
      </div>{/each}
    </div>
    <p class="hint mb-0">Every piece's lines added up: main stats with their enchant, bonus lines, manastones and the arcana. Before the game's percentages (Might's Attack increase and the like), and without Daevanion, Genus, pets or titles: not the Stat Info total. Click a stat for the pieces that give it.</p>
  </Fold></div>
  {#if eq.pet || eq.wing}<h3 class="mt-4 mb-2 text-sm font-semibold">Pet / Wings</h3><ul class="eq-list eq-cols">
    {#if eq.pet}<li class="eq-row">{#if eq.pet.icon}<img src={eq.pet.icon} alt="" width="32" height="32" loading="lazy">{/if}{eq.pet.name}{eq.pet.level != null ? ` Lv ${eq.pet.level}` : ""}</li>{/if}
    {#if eq.wing}<li class="eq-row">{#if eq.wing.icon}<img src={eq.wing.icon} alt="" width="32" height="32" loading="lazy">{/if}<span class="grade-{eq.wing.grade}">{eq.wing.name}</span></li>{/if}
  </ul>{/if}
  {@render skills("Active skills", eq.active)}
  {@render skills("Passive skills", eq.passive)}
  {@render skills("Stigma", eq.stigma, true)}
{/if}
