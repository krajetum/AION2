<script lang="ts">
  // The soul points popup (index.html#souls, opened by src-tauri/src/meter.rs for a few seconds): your kills that gave
  // soul points to a pet you still need and the shards you loot, added up while they keep coming (domain/soul-pop.ts):
  // the number pops on each gain, "COMBO ×N" from the second, "ON FIRE" from the tenth. Drag it anywhere.
  // Outside Tauri (npm run dev) a demo combo runs, to preview it.
  import { isTauri } from "@tauri-apps/api/core";
  import { COMBO_MS, isCombo, onFire, ON_FIRE, popText, type SoulPop } from "../domain/soul-pop.ts";
  import { onSoulsPop } from "../infra/meter.ts";
  import Flame from "@lucide/svelte/icons/flame";

  let pop = $state<SoulPop | null>(null);
  let now = $state(Date.now()), gotAt = $state(0);
  // Shown COMBO_MS from when this window got the gain (the window's clock, whatever the gain's own time).
  $effect(() => { onSoulsPop((p) => { pop = p; now = gotAt = Date.now(); }); });
  // Everything scales with the window (Settings: XS … XL, or dragged by its edges): 84 px high = 1.
  let k = $state(1);
  $effect(() => { const fit = () => { k = Math.max(0.4, window.innerHeight / 84); }; fit(); window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit); });
  $effect(() => { const t = setInterval(() => { now = Date.now(); }, 250); return () => clearInterval(t); });
  // The demo: a gain every 0.8 s, a pause after 12.
  $effect(() => {
    if (isTauri()) return;
    let p: SoulPop | null = null, n = 0;
    const t = setInterval(() => {
      const at = Date.now();
      n = (n + 1) % 15;
      if (n > 12) return;
      p = !p || at - p.lastMs > COMBO_MS ? { points: 2, shards: 0, hits: 1, lastMs: at, label: "Demo pet", progress: "4/25 to level 2" }
        : { ...p, points: p.points + 2, shards: p.shards + (n % 5 === 0 ? 1 : 0), hits: p.hits + 1, lastMs: at, progress: `${(4 + p.points + 2) % 25}/25 to level 2` };
      pop = p;
      gotAt = at;
    }, 800);
    return () => clearInterval(t);
  });
  // "56/75 to level 3": the numbers stand out (bold, the gold), the words stay quiet.
  const progressParts = (t: string): [string, boolean][] => t.split(/(\d+\/\d+)/).filter(Boolean).map((p) => [p, /^\d+\/\d+$/.test(p)]);
  const live = $derived(!!pop && now - gotAt < COMBO_MS);
</script>

{#if pop && live}
  <div class="souls" class:fire={onFire(pop)} data-tauri-drag-region><div class="card" style:zoom={k} data-tauri-drag-region>
    {#key pop.hits}<div class="big" data-tauri-drag-region>{popText(pop).split(" · ")[0]}</div>{/key}
    {#if pop.points && pop.shards}<div class="sub" data-tauri-drag-region>+{pop.shards} shard{pop.shards === 1 ? "" : "s"}</div>{/if}
    <div class="sub" data-tauri-drag-region>{pop.label}{#if pop.progress}{" · "}{#each progressParts(pop.progress) as [part, isNum], i (i)}{#if isNum}<b class="num">{part}</b>{:else}{part}{/if}{/each}{/if}</div>
    {#if isCombo(pop)}{#key pop.hits}<div class="combo" data-tauri-drag-region>{#if onFire(pop)}<Flame class="flame" />ON FIRE! ×{pop.hits}<Flame class="flame" />{:else}COMBO ×{pop.hits}{/if}</div>{/key}{/if}
    </div>
    {#if onFire(pop)}<div class="embers" aria-hidden="true">{#each Array(10) as _, i}<i style:left="{8 + i * 9}%" style:animation-delay="{(i * 137) % 900}ms"></i>{/each}</div>{/if}
  </div>
{/if}
<span class="sr-only" aria-live="polite">{pop && live ? `${popText(pop)}${isCombo(pop) ? `, combo ${pop.hits}` : ""}${pop.hits === ON_FIRE ? ", on fire" : ""}` : ""}</span>

<style>
  .souls { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0;
    color: var(--foreground); text-align: center; overflow: hidden; cursor: move; user-select: none;
    text-shadow: 0 0 3px var(--background), 0 2px 4px var(--background), 0 0 10px var(--background); }
  .card { display: flex; flex-direction: column; align-items: center; }
  .big { font-size: var(--fs-xl); font-weight: 800; line-height: 1.05; color: var(--gold); animation: pop 0.35s cubic-bezier(.2, 1.6, .4, 1); }
  .sub { font-size: var(--fs-xs); font-weight: 600; opacity: 0.9; }
  .sub .num { font-weight: 800; color: var(--gold); font-variant-numeric: tabular-nums; }
  .combo { font-size: var(--fs-md); font-weight: 900; letter-spacing: 0.08em; color: var(--chart-2); animation: pop 0.3s ease-out; }
  .fire .combo { font-size: var(--fs-lg); color: var(--taken); animation: pop 0.3s ease-out, flicker 0.18s steps(2) infinite alternate; }
  .fire .big { color: var(--star); }
  .combo { display: flex; align-items: center; gap: 4px; }
  .combo :global(.flame) { width: 1em; height: 1em; color: var(--gold); fill: var(--taken); }
  .embers { position: absolute; inset: 0; pointer-events: none; }
  .embers i { position: absolute; bottom: -6px; width: 3px; height: 3px; border-radius: 50%; background: var(--gold);
    box-shadow: 0 0 6px var(--taken); animation: rise 0.9s ease-in infinite; }
  @keyframes pop { 0% { transform: scale(0.4); opacity: 0; } 70% { transform: scale(1.25); opacity: 1; } 100% { transform: scale(1); } }
  @keyframes flicker { to { text-shadow: 0 0 8px var(--gold), 0 0 16px var(--taken), 0 0 3px var(--background); } }
  @keyframes rise { from { transform: translateY(0) scale(1); opacity: 1; } to { transform: translateY(-80px) scale(0.3); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .big, .combo, .fire .combo, .embers i { animation: none; } }
</style>
