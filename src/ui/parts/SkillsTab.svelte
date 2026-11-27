<script lang="ts">
  // Players › Skills: active, passive and stigma skills as icon grids with their levels (not learned dimmed with a
  // lock, an equipped stigma marked E), then your Genus Insight when the character is yours and the meter read it.
  import type { Component } from "svelte";
  import Lock from "@lucide/svelte/icons/lock";
  import Zap from "@lucide/svelte/icons/zap";
  import Shield from "@lucide/svelte/icons/shield";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import type { Skill } from "../../domain/armory.ts";
  import type { GenusRead } from "../../domain/genus.ts";
  import GenusInsight from "./GenusInsight.svelte";
  import type { CharacterSheet } from "./sheet.svelte.ts";

  let { sheet, genus, mine }: { sheet: CharacterSheet; genus: GenusRead | null; mine: boolean } = $props();
  const groups = $derived(sheet.eq ? ([["Active skills", Zap, sheet.eq.active, false], ["Passive skills", Shield, sheet.eq.passive, false],
    ["Stigma", Sparkles, sheet.eq.stigma, true]] as [string, Component, Skill[], boolean][]).filter((g) => g[2].length) : []);
</script>

{#if sheet.eqError}<p class="hint">Skills not read ({sheet.eqError}).</p>
{:else if !sheet.eq}<p class="hint">Reading the skills…</p>
{:else if !groups.length}<p class="hint">No skills on the official profile.</p>
{:else}{#each groups as [title, Icon, list, stigma] (title)}
  <h3 class="mt-4 mb-2 flex items-center gap-1.5 text-sm font-semibold first:mt-0"><Icon class="size-4 text-muted-foreground" />{title}
    <span class="text-xs font-normal text-muted-foreground">{list.filter((s) => s.level).length} / {list.length} learned</span></h3>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
    {#each list as s (s.id)}<div class="flex flex-col items-center gap-1 text-center" title="{s.name}{s.level ? ` · level ${s.level}` : ' · not learned'}{stigma && s.equipped ? ' · equipped' : ''}">
      <span class="relative grid size-11 place-items-center rounded-md bg-muted {s.level ? '' : 'opacity-40'} {stigma && s.equipped ? 'ring-2 ring-primary' : ''}">
        {#if s.icon}<img src={s.icon} alt="" class="size-11 rounded-md" loading="lazy">{:else}<Icon class="size-5 text-muted-foreground" />{/if}
        {#if stigma && s.equipped}<span class="absolute -top-1.5 -left-1.5 rounded bg-primary px-1 text-[10px] leading-tight font-bold text-primary-foreground">E</span>{/if}
        {#if !s.level}<Lock class="absolute size-4 text-foreground" />{/if}
      </span>
      <span class="w-full truncate text-[11px] leading-tight text-muted-foreground">{s.name}</span>
      <span class="text-xs font-semibold tabular-nums">{s.level ? `Lv ${s.level}` : "—"}</span>
    </div>{/each}
  </div>{/each}
{/if}
<div class="mt-4">
  {#if genus}<GenusInsight g={genus} />
  {:else if mine}<p class="hint m-0">Genus Insight: the game sends it when you enter the world. Log in (or change character) with the companion open to see it here.</p>{/if}
</div>
