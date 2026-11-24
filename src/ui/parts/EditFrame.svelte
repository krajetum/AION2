<script lang="ts">
  // "Edit overlays": while editing, a frame over this overlay window (mounted by main.ts next to the overlay):
  // its name, dragged to move the window, its corner dragged to resize it (only the overlays sized by hand).
  import Move from "@lucide/svelte/icons/move";
  import { HUD_NAMES } from "../../domain/hud.ts";
  import { onHudEdit } from "../../infra/meter.ts";

  let { label }: { label: string } = $props();
  let editing = $state(false);
  $effect(() => { onHudEdit((on) => { editing = on; }); });
  // Which sides the player sets (src-tauri/src/meter.rs `sized_by_hand`).
  const GRIPS: Record<string, "SouthEast" | "East"> = { overlay: "SouthEast", radar: "SouthEast", net: "SouthEast", events: "East" };
  const grip = $derived(GRIPS[label]);
  let size = $state("");
  const measure = () => { size = `${Math.round(window.innerWidth)} × ${Math.round(window.innerHeight)}`; };
  $effect(() => { measure(); addEventListener("resize", measure); return () => removeEventListener("resize", measure); });

  async function resize(e: PointerEvent) {
    e.preventDefault();
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().startResizeDragging(grip).catch((err) => console.warn("Resize failed", err));
  }
</script>

{#if editing}
  <div class="edit-frame" data-tauri-drag-region>
    <span class="tag" data-tauri-drag-region><Move class="size-3" />{HUD_NAMES[label] ?? label}</span>
    <span class="size" data-tauri-drag-region>{size}</span>
    {#if grip}<button class="grip" class:east={grip === "East"} aria-label="Resize" title="Drag to resize" onpointerdown={resize}></button>{/if}
  </div>
{/if}

<style>
  .edit-frame {
    position: fixed; inset: 0; z-index: 9999; cursor: move;
    border: 2px dashed var(--primary); border-radius: 6px;
    background: color-mix(in oklch, var(--primary) 18%, color-mix(in srgb, var(--background) 70%, transparent));
    display: flex; flex-direction: column; align-items: flex-start; justify-content: space-between; padding: 4px 6px;
  }
  .tag { display: inline-flex; align-items: center; gap: 4px; font: 600 11px/1.2 system-ui, sans-serif; color: var(--primary-foreground);
    background: var(--primary); padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
  .size { font: 10px/1 system-ui, sans-serif; color: var(--primary-foreground); opacity: 0.75; font-variant-numeric: tabular-nums; }
  .grip { all: unset; position: absolute; right: 0; bottom: 0; width: 16px; height: 16px; cursor: nwse-resize;
    background: linear-gradient(135deg, transparent 50%, var(--primary) 50%); border-bottom-right-radius: 6px; }
  .grip.east { top: 0; bottom: 0; height: auto; width: 8px; cursor: ew-resize; background: color-mix(in oklch, var(--primary) 60%, transparent); }
</style>
