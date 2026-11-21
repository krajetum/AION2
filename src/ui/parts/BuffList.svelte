<script lang="ts">
  // A player's buffs in a boss fight with their uptime: scrolls and food first, then the rest (meter: buffs.rs).
  import { buffShare, type PlayerRow } from "../../domain/meter.ts";

  let { row, ms }: { row: PlayerRow; ms: number } = $props();
  const consumables = $derived((row.buffs ?? []).filter((b) => b.kind === "scroll" || b.kind === "food"));
  const others = $derived((row.buffs ?? []).filter((b) => b.kind !== "scroll" && b.kind !== "food"));
</script>

{#if row.buffs}
  <h3 class="sub">Buffs</h3>
  {#if row.buffs.length}
    {#each [["Scrolls & food", consumables], ["Buffs", others]] as const as [title, list] (title)}
      {#if list.length}<p class="group">{title}</p>
        <ul class="buffs">{#each list as b (b.name)}{@const p = buffShare(b, ms)}
          <li><span class="bname">{b.name}{#if b.own}<small> · self</small>{/if}</span>
            <span class="ubar" aria-hidden="true"><i style:width="{Math.round(p * 100)}%" class:full={p >= 0.99}></i></span>
            <span class="num">{Math.round(p * 100)}%</span></li>{/each}</ul>
      {:else if title === "Scrolls & food"}<p class="hint">No scroll or food on this player during the fight.</p>{/if}
    {/each}
  {:else}<p class="hint">No buff long enough to show.</p>{/if}
  <p class="hint">Uptime over the fight's length. Scrolls and food used before the meter saw them count as up the whole fight.</p>
{/if}

<style>
  .sub { font-size: var(--fs-sm); color: var(--muted); margin: 10px 0 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .group { margin: 8px 0 2px; font-size: var(--fs-sm); font-weight: 600; }
  .buffs { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 2px 16px; }
  .buffs li { display: grid; grid-template-columns: minmax(0, 1fr) 90px 40px; align-items: center; gap: 8px; padding: 3px 0; }
  .bname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bname small { display: inline; color: var(--muted); font-size: inherit; }
  .ubar { height: 6px; background: var(--raised); border-radius: 3px; overflow: hidden; }
  .ubar i { display: block; height: 100%; background: var(--accent); }
  .ubar i.full { background: var(--positive); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
</style>
