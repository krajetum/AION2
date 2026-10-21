<script lang="ts">
  // The event countdown window (index.html#events, opened by src-tauri/src/meter.rs): the next start of
  // every recurring event, counted down. Times are the TO VERIFY ones in config.ts. Drag it by the header.
  import { EVENTS, RESET_CONFIG as C } from "../config.ts";
  import { formatCountdown, nextEvent } from "../domain/time.ts";
  import { eventsOverlay } from "../infra/meter.ts";
  import { hm } from "./format.ts";
  import { ICON } from "./icons.ts";

  let now = $state(Date.now());
  $effect(() => { const t = setInterval(() => (now = Date.now()), 1000); return () => clearInterval(t); });
  const list = $derived(EVENTS.map((ev) => ({ ev, at: nextEvent(ev, now, C.timeZone) })).sort((a, b) => a.at - b.at));
</script>

<div class="ov-head" data-tauri-drag-region>
  <b data-tauri-drag-region>Next events</b>
  <button class="ghost" aria-label="Close the event overlay" title="Close (turn on again in Settings)" onclick={() => eventsOverlay(false)}>{@html ICON.close}</button>
</div>
<ol class="ev-rows">{#each list as { ev, at } (ev.id)}
  <li class:soon={at - now < 5 * 60_000}><span class="name" data-tauri-drag-region>{ev.name}</span>
    <span class="num">{formatCountdown(at - now)}</span><span class="num dim">{hm(at)}</span></li>
{/each}</ol>
