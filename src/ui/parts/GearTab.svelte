<script lang="ts">
  // Players › Gear: every piece as a card (GearCard: its lines, the class's best-in-slot lines behind BiS, Edit for the
  // player's own list), gear, accessories and arcana, from the opened character's sheet.
  import type { Component } from "svelte";
  import type { Piece } from "../../domain/armory.ts";
  import { bisLines, bisSlot, type BisLine } from "../../domain/bis.ts";
  import { setBis } from "../../app/bis.ts";
  import { act } from "../actions.ts";
  import { ui } from "../state.svelte.ts";
  import { slotIcon } from "../icons.ts";
  import GearCard from "./GearCard.svelte";
  import { BIS, type CharacterSheet } from "./sheet.svelte.ts";
  import Gem from "@lucide/svelte/icons/gem";
  import Sparkle from "@lucide/svelte/icons/sparkle";

  let { sheet }: { sheet: CharacterSheet } = $props();
  const className = $derived(sheet.className);
  const linesOf = (slot: string | null) => (slot ? bisLines(BIS.classes, ui.data.bis, className, slot) : null);
  const saveOf = (slot: string | null) => (lines: BisLine[] | null) => { if (slot) act(() => setBis(ui.data, className, slot, lines)); };
</script>

{#snippet cards(list: Piece[])}<div class="gcards">{#each list as p (p.slot)}{@const slot = bisSlot(p.slotName)}
  <GearCard {p} {slot} detail={sheet.details[p.slot]} failed={sheet.errors[p.slot] ?? ""}
    lines={linesOf(slot)} custom={!!slot && !!ui.data.bis[className]?.[slot]} {className} save={saveOf(slot)} />{/each}</div>{/snippet}
{#snippet title(Icon: Component, text: string, n: number)}<h3 class="mt-4 mb-2 flex items-center gap-1.5 text-sm font-semibold first:mt-0"><Icon class="size-4 text-muted-foreground" />{text}<span class="text-xs font-normal text-muted-foreground">{n}</span></h3>{/snippet}

{#if sheet.eqError}<p class="hint">Equipment not read ({sheet.eqError}).</p>
{:else if !sheet.eq}<p class="hint">Reading the equipment…</p>
{:else}{@const eq = sheet.eq}
  {@render title(slotIcon("Weapon"), "Gear", eq.gear.length)}{@render cards(eq.gear)}
  {@render title(Gem, "Accessories", eq.accessories.length)}{@render cards(eq.accessories)}
  {@render title(Sparkle, "Arcana", eq.arcana.length)}{#if eq.arcana.length}{@render cards(eq.arcana)}{:else}<p class="hint">No arcana equipped: the official profile lists none for this character.</p>{/if}
  <p class="hint">Best-in-slot lines from <a class="underline" href={BIS.sourceUrl} target="_blank" rel="noopener">{BIS.source}</a> ({BIS.captured}), with its % per line; Edit on a card's back keeps your own list.</p>
{/if}
