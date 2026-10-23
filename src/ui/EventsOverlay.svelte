<script lang="ts">
  // The event countdown window (index.html#events, opened by src-tauri/src/meter.rs): the next start of
  // every recurring event, counted down (times are the TO VERIFY ones in config.ts), and the next field-boss
  // respawn: every boss due in that same minute. Drag it by the header.
  import { EVENTS, RESET_CONFIG as C } from "../config.ts";
  import { mergeBosses, nextBossWave } from "../domain/bosses.ts";
  import type { BossTimer } from "../domain/meter.ts";
  import { formatCountdown, nextEvent } from "../domain/time.ts";
  import { eventsOverlay, fitOverlayHeight, onMeter } from "../infra/meter.ts";
  import { loadData } from "../infra/storage.ts";
  import { hm } from "./format.ts";
  import { ICON } from "./icons.ts";

  let now = $state(Date.now());
  $effect(() => { const t = setInterval(() => (now = Date.now()), 1000); return () => clearInterval(t); });
  // Bosses: the saved ones (maps read in earlier sessions), then every map the meter reads now.
  let saved = $state<BossTimer[]>([]), live = $state<BossTimer[]>([]);
  $effect(() => { loadData().then((d) => { saved = d.bosses; }).catch(() => {}); });
  $effect(() => onMeter((u) => { live = u.bosses ?? []; }));
  const wave = $derived(nextBossWave(mergeBosses(saved, live) ?? saved, now));

  // The window grows and shrinks with its rows, so every boss of a big wave shows (10, 20, ...).
  let box = $state<HTMLDivElement>();
  $effect(() => {
    const el = box;
    if (!el) return;
    const ro = new ResizeObserver(() => fitOverlayHeight(el.offsetHeight + 8)); // + #app's bottom padding
    ro.observe(el);
    return () => ro.disconnect();
  });
  const list = $derived(EVENTS.map((ev) => ({ ev, at: nextEvent(ev, now, C.timeZone) })).sort((a, b) => a.at - b.at));
</script>

<div bind:this={box}>
<div class="ov-head" data-tauri-drag-region>
  <b data-tauri-drag-region>Next events</b>
  <button class="ghost" aria-label="Close the event overlay" title="Close (turn on again in Settings)" onclick={() => eventsOverlay(false)}>{@html ICON.close}</button>
</div>
<ol class="ev-rows">{#each list as { ev, at } (ev.id)}
  <li class:soon={at - now < 5 * 60_000}><span class="name" data-tauri-drag-region>{ev.name}</span>
    <span class="num">{formatCountdown(at - now)}</span><span class="num dim">{hm(at)}</span></li>
{/each}
{#if wave.names.length}<li class="boss" class:soon={wave.timeMs - now < 5 * 60_000}>
    <span class="name" data-tauri-drag-region>Next field boss</span>
    <span class="num">{formatCountdown(wave.timeMs - now)}</span><span class="num dim">{hm(wave.timeMs)}</span>
    <span class="who" data-tauri-drag-region>{#each wave.names as n}<span>{n} spawns</span>{/each}</span></li>{/if}</ol>
</div>
