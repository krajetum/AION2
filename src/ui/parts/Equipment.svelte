<script lang="ts">
  // A character's equipment from the official profile (infra/armory.ts), as cards: gear, accessories and arcana
  // (`GearCard`: the piece's lines, and its best-in-slot lines for the class behind a BiS button), pet and wings,
  // skills and stigma. Each piece's details are read one after another (the request queue spaces them).
  import bundled from "../../assets/bis.json";
  import type { Equipment, ItemDetail, Piece, Skill } from "../../domain/armory.ts";
  import { bisLines, bisSlot, type BisLine, type BisTable } from "../../domain/bis.ts";
  import { setBis } from "../../app/bis.ts";
  import { equipmentOf, itemOf } from "../../infra/armory.ts";
  import { gearStats, gearText } from "../../domain/gearstats.ts";
  import { ARMOUR_SLOTS, armourPassives, planPiece, rankPlans, rankSkills, rankTable, statNamesOf, worthLines, type RankFile } from "../../domain/reroll.ts";
  import rankFile from "../../assets/ranks.json";
  import { arcanaPlan } from "../../domain/arcana.ts";
  import carryFile from "../../assets/carry.json";
  import UpgradeCards from "./UpgradeCards.svelte";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Fold from "$lib/components/app/Fold.svelte";
  import { act } from "../actions.ts";
  import { ui } from "../state.svelte.ts";
  import GearCard from "./GearCard.svelte";

  let { characterId, serverId, className }: { characterId: string; serverId: number; className: string } = $props();
  const BIS = bundled as { classes: BisTable; source: string; sourceUrl: string; captured: string };
  const BUNDLED = BIS.classes;

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

  const all = $derived(eq ? [...eq.gear, ...eq.accessories, ...eq.arcana] : []);
  const fromGear = $derived(gearStats(all.map((p) => ({ piece: p, detail: details[p.slot] }))));
  const readCount = $derived(all.filter((p) => p.slot in details || p.slot in errors).length);
  let shownStat = $state("");
  const linesOf = (slot: string | null) => (slot ? bisLines(BUNDLED, ui.data.bis, className, slot) : null);
  const customOf = (slot: string | null) => !!slot && !!ui.data.bis[className]?.[slot];
  // Upgrades: every read piece with a known draw and ideal lines, the most score per expected try first.
  const CARRY = carryFile as { classes: Record<string, Record<string, Record<string, number>>>; source: string; sourceUrl: string; captured: string; players: Record<string, number> };
  const STAT_NAMES = statNamesOf(CARRY.classes);
  const RANKS = rankFile as unknown as RankFile & { source: string; captured: string };
  const plans = $derived(rankPlans(all.flatMap((p) => {
    const slot = bisSlot(p.slotName), d = details[p.slot];
    if (!slot || !d || !d.random) return [];
    const jewel = slot === "Necklace" || slot === "Earring" || ARMOUR_SLOTS.includes(slot);
    // The static's ranks where they have the slot (skill lines: the best-in-slot's, worth B), else kisk's carry shares.
    const ranks = rankTable(RANKS, slot), passives = jewel ? armourPassives(ARMOUR_SLOTS.map((s) => linesOf(s)), STAT_NAMES) : [];
    const ideal = ranks
      ? worthLines(ranks.worth, rankSkills(RANKS, linesOf(slot) ?? []), STAT_NAMES, rankSkills(RANKS, passives))
      : worthLines(CARRY.classes[className]?.[slot], linesOf(slot), STAT_NAMES, passives);
    const canAdd = ![...d.sub, ...d.skills].some((x) => x.added);
    const lines = [...d.sub.map((x) => x.name), ...d.skills.map((x) => x.name)];
    const plan = planPiece(slot, lines, ideal, 4000, canAdd);
    return plan ? [{ p, plan, ideal, lines, ranked: ranks?.ranked ?? null }] : [];
  })));
  // Every skill's level with its bonuses (the profile's), for what the arcana still need.
  const totals = $derived(Object.fromEntries([...(eq?.active ?? []).map((s) => [s.name, { level: s.level ?? 0, passive: false }]),
    ...(eq?.passive ?? []).map((s) => [s.name, { level: s.level ?? 0, passive: true }])]));
  // Arcana: a Transmute plan for each Unique one read (domain/arcana.ts), easiest gain first.
  const arcana = $derived((eq?.arcana ?? []).flatMap((p) => {
    const slot = bisSlot(p.slotName), d = details[p.slot], ideal = linesOf(slot);
    if (!slot || !d || !ideal || p.grade !== "Unique") return [];
    const plan = arcanaPlan(slot, d.skills, ideal, totals);
    return plan ? [{ p, slot, held: d.skills, plan, ideal }] : [];
  }).sort((a, b) => Number(b.plan.craft) - Number(a.plan.craft) || b.plan.missing.length - a.plan.missing.length));
  const notUnique = $derived((eq?.arcana ?? []).filter((p) => p.grade !== "Unique").map((p) => p.name));
  // "Best upgrades" shows the reroll plans in place of the cards.
  let upgrades = $state(false);
  const saveOf = (slot: string | null) => (lines: BisLine[] | null) => { if (slot) act(() => setBis(ui.data, className, slot, lines)); };
</script>

{#snippet cards(list: Piece[])}<div class="gcards">{#each list as p (p.slot)}{@const slot = bisSlot(p.slotName)}
  <GearCard {p} {slot} detail={p.slot in details ? details[p.slot] : undefined} failed={errors[p.slot] ?? ""}
    lines={linesOf(slot)} custom={customOf(slot)} {className} save={saveOf(slot)} />{/each}</div>{/snippet}

{#snippet skills(title: string, list: Skill[], stigma = false)}
  {#if list.length}<h3 class="mt-4 mb-2 text-sm font-semibold">{title}</h3><div class="eq-skills">
    {#each list as s (s.id)}<span class="eq-skill" class:locked={s.level === 0} title="{s.name}{s.level ? ` · level ${s.level}` : ' · not learned'}{stigma && s.equipped ? ' · equipped' : ''}">
      {#if s.icon}<img src={s.icon} alt="" width="40" height="40" loading="lazy">{/if}
      {#if stigma && s.equipped}<i class="eq-e">E</i>{/if}{#if s.level}<small>Lv {s.level}</small>{:else}<small>🔒</small>{/if}</span>{/each}
  </div>{/if}
{/snippet}
{#if loading}<p class="hint">Reading the equipment…</p>
{:else if failed}<p class="hint">Equipment not read ({failed}).</p>
{:else if eq}
  <div class="mt-4 mb-2 flex items-center gap-3"><h3 class="m-0 text-sm font-semibold">{upgrades ? "Best upgrades" : "Gear"}</h3>
    <button class="bis-btn" title="Which lines to reroll, piece by piece, and which piece first" aria-pressed={upgrades} onclick={() => { upgrades = !upgrades; }}>{upgrades ? "Gear" : "Best upgrades"}</button></div>
  {#if upgrades}<UpgradeCards {plans} ranks={RANKS} {totals} {arcana} {notUnique} reading={readCount < all.length} {className} players={CARRY.players[className] ?? 0} source={CARRY} />
  {:else}{@render cards(eq.gear)}
  <h3 class="mt-4 mb-2 text-sm font-semibold">Accessories</h3>{@render cards(eq.accessories)}
  <h3 class="mt-4 mb-2 text-sm font-semibold">Arcana</h3>{#if eq.arcana.length}{@render cards(eq.arcana)}{:else}<p class="hint">No arcana equipped: the official profile lists none for this character.</p>{/if}{/if}
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
