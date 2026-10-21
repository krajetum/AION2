<script lang="ts">
  // The overlay window (index.html#overlay, opened by src-tauri/src/meter.rs): a compact, always-on-top
  // view of the current fight. Drag it by the header; it never takes the focus from the game.
  import { clock, displayName, hpLeft, short, STATUS_TEXT, type MeterUpdate } from "../domain/meter.ts";
  import { meterOverlay, meterReset, onMeter } from "../infra/meter.ts";
  import { ICON } from "./icons.ts";

  let u = $state<MeterUpdate | undefined>();
  $effect(() => onMeter((x) => { u = x; }));

  const f = $derived(u?.fight);
  const left = $derived(f?.target ? hpLeft(f.target) : undefined);
  const top = $derived(f?.rows[0]?.damage || 1);
  const title = $derived(f?.target?.name || (u && u.status !== "connected" ? STATUS_TEXT[u.status] : "No fight"));
</script>

<div class="ov-head" data-tauri-drag-region>
  <b data-tauri-drag-region>{title}</b>
  <span class="num" data-tauri-drag-region>{clock(f?.battleTimeMs ?? 0)}</span>
  <button class="ghost" aria-label="Reset" title="Reset" onclick={() => meterReset()}>↺</button>
  <button class="ghost" aria-label="Close overlay" title="Close" onclick={() => meterOverlay(false)}>{@html ICON.close}</button>
</div>
{#if left != null}<div class="bar hp"><i style:--p={String(left)}></i></div>{/if}
<ol class="ov-rows">{#each f?.rows ?? [] as r (r.id)}
  <li class:you={r.isYou} style:--p={String(Math.min(1, r.damage / top))}>
    <span class="name">{displayName(r)}</span><span class="num">{short(r.dps)}/s</span><span class="num dim">{r.share.toFixed(0)}%</span></li>
{/each}</ol>
