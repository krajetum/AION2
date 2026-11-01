<script lang="ts">
  // A character's equipment from the official profile (infra/armory.ts), as cards: gear, accessories and arcana
  // (`GearCard`: the piece's lines, and its best-in-slot lines for the class behind a BiS button), pet and wings,
  // skills and stigma. Each piece's details are read one after another (the request queue spaces them).
  import bundled from "../../assets/bis.json";
  import type { Equipment, ItemDetail, Piece, Skill } from "../../domain/armory.ts";
  import { bisLines, bisSlot, type BisLine, type BisTable } from "../../domain/bis.ts";
  import { setBis } from "../../app/bis.ts";
  import { equipmentOf, itemOf } from "../../infra/armory.ts";
  import { act } from "../actions.ts";
  import { ui } from "../state.svelte.ts";
  import GearCard from "./GearCard.svelte";

  let { characterId, serverId, className }: { characterId: string; serverId: number; className: string } = $props();
  const BUNDLED = (bundled as { classes: BisTable }).classes;

  let eq = $state<Equipment | null>(null), failed = $state(""), loading = $state(true);
  // Each piece's details by slot: undefined = not read yet.
  let details = $state<Record<number, ItemDetail | null>>({}), errors = $state<Record<number, string>>({});
  $effect(() => {
    const id = characterId, server = serverId;
    let live = true;
    eq = null; failed = ""; loading = true; details = {}; errors = {};
    equipmentOf(id, server).then((v) => {
      if (!live) return;
      eq = v;
      if (!v) { failed = "the site sent no equipment"; return; }
      for (const p of [...v.gear, ...v.accessories, ...v.arcana]) itemOf(p, id, server).then(
        (d) => { if (live) details[p.slot] = d; },
        (e) => { if (live) errors[p.slot] = e instanceof Error ? e.message : String(e); });
    }, (e) => { if (live) failed = e instanceof Error ? e.message : String(e); }).finally(() => { if (live) loading = false; });
    return () => { live = false; };
  });

  const linesOf = (slot: string | null) => (slot ? bisLines(BUNDLED, ui.data.bis, className, slot) : null);
  const customOf = (slot: string | null) => !!slot && !!ui.data.bis[className]?.[slot];
  const saveOf = (slot: string | null) => (lines: BisLine[] | null) => { if (slot) act(() => setBis(ui.data, className, slot, lines)); };
</script>

{#snippet cards(list: Piece[])}<div class="gcards">{#each list as p (p.slot)}{@const slot = bisSlot(p.slotName)}
  <GearCard {p} {slot} detail={p.slot in details ? details[p.slot] : undefined} failed={errors[p.slot] ?? ""}
    lines={linesOf(slot)} custom={customOf(slot)} {className} save={saveOf(slot)} />{/each}</div>{/snippet}

{#snippet skills(title: string, list: Skill[], stigma = false)}
  {#if list.length}<h3>{title}</h3><div class="eq-skills">
    {#each list as s (s.id)}<span class="eq-skill" class:locked={s.level === 0} title="{s.name}{s.level ? ` · level ${s.level}` : ' · not learned'}{stigma && s.equipped ? ' · equipped' : ''}">
      {#if s.icon}<img src={s.icon} alt="" width="40" height="40" loading="lazy">{/if}
      {#if stigma && s.equipped}<i class="eq-e">E</i>{/if}{#if s.level}<small>Lv {s.level}</small>{:else}<small>🔒</small>{/if}</span>{/each}
  </div>{/if}
{/snippet}
{#if loading}<p class="hint">Reading the equipment…</p>
{:else if failed}<p class="hint">Equipment not read ({failed}).</p>
{:else if eq}
  <h3>Gear</h3>{@render cards(eq.gear)}
  <h3>Accessories</h3>{@render cards(eq.accessories)}
  {#if eq.arcana.length}<h3>Arcana</h3>{@render cards(eq.arcana)}{/if}
  {#if eq.pet || eq.wing}<h3>Pet / Wings</h3><ul class="eq-list eq-cols">
    {#if eq.pet}<li class="eq-row">{#if eq.pet.icon}<img src={eq.pet.icon} alt="" width="32" height="32" loading="lazy">{/if}{eq.pet.name}{eq.pet.level != null ? ` Lv ${eq.pet.level}` : ""}</li>{/if}
    {#if eq.wing}<li class="eq-row">{#if eq.wing.icon}<img src={eq.wing.icon} alt="" width="32" height="32" loading="lazy">{/if}<span class="grade-{eq.wing.grade}">{eq.wing.name}</span></li>{/if}
  </ul>{/if}
  {@render skills("Active skills", eq.active)}
  {@render skills("Passive skills", eq.passive)}
  {@render skills("Stigma", eq.stigma, true)}
{/if}
