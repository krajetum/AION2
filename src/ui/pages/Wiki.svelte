<script lang="ts">
  import UnderlineTabs from "$lib/components/app/UnderlineTabs.svelte";
  import WikiDungeons from "./WikiDungeons.svelte";
  import WikiMechanics from "./WikiMechanics.svelte";

  // The four wiki sections, one page; the last one opened is remembered (this browser only).
  const SECTIONS = [["expedition", "Expeditions"], ["transcendence", "Transcendence"], ["sanctuary", "Sanctuary"], ["rules", "Dungeon Rules"]] as const;
  type Section = (typeof SECTIONS)[number][0];
  const KEY = "aion2-wiki-section";
  let section = $state<Section>("expedition");
  $effect(() => { try { const s = localStorage.getItem(KEY); if (SECTIONS.some(([id]) => id === s)) section = s as Section; } catch { /* default */ } });
  function pick(s: Section) {
    section = s;
    try { localStorage.setItem(KEY, s); } catch { /* not kept */ }
  }
</script>

<div class="mb-3"><UnderlineTabs label="Wiki section" items={SECTIONS} value={section} onchange={pick} /></div>
{#if section === "rules"}<WikiMechanics />{:else}<WikiDungeons kind={section} />{/if}
