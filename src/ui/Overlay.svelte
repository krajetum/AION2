<script lang="ts">
  // The overlay window (index.html#overlay, opened by src-tauri/src/meter.rs): a compact, always-on-top
  // view of the current fight. Drag it by the header; it never takes the focus from the game.
  import { clock, displayName, hpLeft, short, STATUS_TEXT, viewRows, type MeterUpdate } from "../domain/meter.ts";
  import { meterOverlayHide, meterReset, onMeter } from "../infra/meter.ts";
  import { ICON } from "./icons.ts";

  let u = $state<MeterUpdate | undefined>();
  $effect(() => onMeter((x) => { u = x; }));

  const f = $derived(u?.fight);
  const left = $derived(f?.target ? hpLeft(f.target) : undefined);
  const rows = $derived(f ? viewRows(f, u!.view) : []);
  const title = $derived(f?.target?.name || (u && u.status !== "connected" ? STATUS_TEXT[u.status] : "No fight"));
</script>

<div class="ov-head" data-tauri-drag-region>
  <b data-tauri-drag-region>{title}</b>
  <span class="num" data-tauri-drag-region>{clock(f?.battleTimeMs ?? 0)}</span>
  <button class="ghost" aria-label="Reset" title="Reset" onclick={() => meterReset()}>↺</button>
  <button class="ghost" aria-label="Hide until the next fight" title="Hide until the next fight" onclick={() => meterOverlayHide()}>{@html ICON.close}</button>
</div>
{#if left != null}<div class="bar hp"><i style:--p={String(left)}></i></div>{/if}
{#if u && u.view !== "damage"}<small class="ov-view">{u.view === "healing" ? "Healing" : "Damage taken"}</small>{/if}
<ol class="ov-rows">{#each rows as { row: r, perSec, share } (r.id)}
  <li class:you={r.isYou} class:heal={u?.view === "healing"} class:taken={u?.view === "taken"} style:--p={String(Math.min(1, perSec / (rows[0].perSec || 1)))}>
    <span class="name">{displayName(r)}</span><span class="num">{short(perSec)}/s</span><span class="num dim">{share.toFixed(0)}%</span></li>
{/each}</ol>
