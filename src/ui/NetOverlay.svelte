<script lang="ts">
  // The ping and packet loss window (index.html#net, opened by src-tauri/src/meter.rs): one small line to lay
  // anywhere over the game. Ping = the game's own (A2Tools' ping tracker); loss = segments TCP resent on the game
  // connection over the last minute (netstats.rs), so at most the real loss. Drag it anywhere.
  import type { MeterUpdate } from "../domain/meter.ts";
  import { netOverlay, onMeter } from "../infra/meter.ts";
  import { ICON } from "./icons.ts";

  let u = $state<MeterUpdate | null>(null);
  $effect(() => onMeter((x) => { u = x; }));
  // Rough bands for the colour only.
  const pingCls = $derived(u?.pingMs == null ? "" : u.pingMs < 80 ? "good" : u.pingMs < 150 ? "warn" : "bad");
  const lossCls = $derived(u?.lossPct == null ? "" : u.lossPct < 1 ? "good" : u.lossPct < 3 ? "warn" : "bad");
</script>

<div class="net-ov" data-tauri-drag-region title="Ping: the game's own. Loss: packets resent on the game connection in the last minute (at most the real loss).">
  <span class="num {pingCls}" data-tauri-drag-region>{u?.pingMs != null ? `${u.pingMs} ms` : "— ms"}</span>
  <span class="num {lossCls}" data-tauri-drag-region>{u?.lossPct != null ? `${u.lossPct.toFixed(1)}% loss` : "— loss"}</span>
  <button class="ghost" aria-label="Close the ping overlay" title="Close (turn on again in Settings or on the DPS page)" onclick={() => netOverlay(false)}>{@html ICON.close}</button>
</div>
