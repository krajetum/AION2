<script lang="ts">
  // The "Edit overlays" panel (index.html#hud, opened by src-tauri/src/meter.rs `hud_edit`), like the game's Edit HUD:
  // every overlay that is on shows with a frame; drag one to move it, its corner to resize it. Six presets keep a
  // layout (places, which overlays are on, the popups' sizes). The main window keeps them (ui/hud.ts): this asks it.
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import Download from "@lucide/svelte/icons/download";
  import Save from "@lucide/svelte/icons/save";
  import { isTauri } from "@tauri-apps/api/core";
  import { defaultPresets, HUD_OVERLAYS, PRESET_NAME_MAX } from "../domain/hud.ts";
  import { onHudState, sendHudCmd, type HudCmd, type HudState } from "../infra/meter.ts";
  import { ICON } from "./icons.ts";

  let st = $state<HudState | null>(null);
  let slot = $state(0), picked = false;
  let busy = $state(false);
  // Outside the desktop app (npm run dev): a demo state, to see the panel.
  const demo = (): HudState => ({ presets: defaultPresets().map((p, i) => ({ name: i === 1 ? "Abyss" : p.name, savedMs: i < 2 ? Date.now() : null })),
    active: 1, on: { overlay: true, events: true, cube: false, radar: false, net: true, souls: true } });
  $effect(() => {
    if (!isTauri()) { st = demo(); slot = 1; return; }
    onHudState((s) => { st = s; if (!picked) { slot = s.active; picked = true; } });
    sendHudCmd({ cmd: "hello" });
  });
  const send = async (c: HudCmd) => { busy = true; try { await sendHudCmd(c); } finally { busy = false; } };
  const preset = $derived(st?.presets[slot]);
  const when = (t: number) => new Date(t).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
</script>

<div class="flex h-dvh flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-2xl">
  <header class="flex items-center gap-2 border-b border-border px-3 py-2" data-tauri-drag-region>
    <b class="text-sm text-primary" data-tauri-drag-region>Edit overlays</b>
    <span class="flex-1" data-tauri-drag-region></span>
    <Button variant="ghost" size="icon-xs" aria-label="Cancel" title="Cancel: overlays back where they were" onclick={() => send({ cmd: "cancel" })}><ICON.close /></Button>
  </header>

  {#if !st}<p class="p-4 text-sm text-muted-foreground">Waiting for the companion…</p>
  {:else}
  <div class="flex-1 space-y-4 overflow-y-auto p-3 text-sm">
    <div class="space-y-2">
      <h3 class="text-xs font-semibold text-muted-foreground uppercase">Presets</h3>
      <div class="grid grid-cols-6 gap-1">
        {#each st.presets as p, i (i)}
          <button class="h-8 rounded-md border text-sm tabular-nums {slot === i ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}"
            title={p.name} aria-pressed={slot === i} onclick={() => { slot = i; }}>{i + 1}{#if st.active === i}<span class="text-[9px]"> ●</span>{/if}</button>
        {/each}
      </div>
      {#if preset}
        {#key slot}<Input class="h-8" value={preset.name} maxlength={PRESET_NAME_MAX} aria-label="Preset name"
          onchange={(e) => send({ cmd: "rename", slot, name: e.currentTarget.value })} />{/key}
        <p class="text-xs text-muted-foreground">{preset.savedMs ? `Saved ${when(preset.savedMs)}` : "Empty: place the overlays, then save them here."}</p>
        <div class="flex gap-2">
          <Button class="flex-1" variant="outline" size="sm" disabled={busy} onclick={() => send({ cmd: "save", slot })}><Save />Save here</Button>
          <Button class="flex-1" variant="outline" size="sm" disabled={busy || !preset.savedMs} onclick={() => send({ cmd: "load", slot })}><Download />Load</Button>
        </div>
      {/if}
    </div>

    <div class="space-y-1">
      <h3 class="text-xs font-semibold text-muted-foreground uppercase">Overlays</h3>
      {#each HUD_OVERLAYS as o (o.label)}
        <label class="flex items-center justify-between gap-2 py-1">{o.name}
          <Switch checked={st.on[o.label]} disabled={busy} onCheckedChange={(on) => send({ cmd: "toggle", label: o.label, on })} /></label>
      {/each}
    </div>
    <p class="text-xs text-muted-foreground">Drag an overlay to move it, drag its corner to resize it. A preset keeps where each overlay is,
      which ones are on and the popups' sizes. Overlays go back to showing only when they have something to say once you are done.</p>
  </div>
  <footer class="flex gap-2 border-t border-border p-3">
    <Button class="flex-1" variant="outline" disabled={busy} onclick={() => send({ cmd: "cancel" })}>Cancel</Button>
    <Button class="flex-1" disabled={busy} onclick={() => send({ cmd: "done" })}>Done</Button>
  </footer>
  {/if}
</div>
