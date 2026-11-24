// "Edit overlays", the main window's side: it keeps the presets (settings.overlayPresets) and the switches, and
// answers the panel window (ui/HudPanel.svelte) by events. Opened from Settings › Overlays or the tray.
import { applyLayout, cleanName, HUD_OVERLAYS, layoutOf, type HudLabel, type HudLayout } from "../domain/hud.ts";
import {
  cubePopup, eventsOverlay, hudCancel, hudEdit, meterOverlay, netOverlay, onHudCmd, onHudOpen, overlayPlaces, radarOverlay,
  sendHudState, setOverlayPlaces, soulsPopup, type HudCmd, type HudState,
} from "../infra/meter.ts";
import { isDesktop } from "../infra/system.ts";
import { act } from "./actions.ts";
import { ui } from "./state.svelte.ts";

/** The switches and popup sizes when editing began: Cancel puts them back (the Rust side puts the places back). */
let before: HudLayout | null = null;

/** Applies one overlay's switch (and size) from the settings, as Settings › Overlays does. */
export function applySwitch(label: HudLabel) {
  const s = ui.data.settings;
  const go: Record<HudLabel, () => Promise<unknown>> = {
    overlay: () => meterOverlay(s.dpsOverlay, false),
    events: () => eventsOverlay(s.eventsOverlay),
    cube: () => cubePopup(s.cubePopup, s.cubePopupSize),
    radar: () => radarOverlay(s.radar),
    net: () => netOverlay(s.netOverlay),
    souls: () => soulsPopup(s.soulPopup, undefined, undefined, s.soulPopupSize),
  };
  go[label]().catch((e) => console.warn(`Overlay ${label}`, e));
}

export async function openHud() {
  if (!isDesktop()) return;
  if (!before) before = layoutOf(ui.data.settings, [], Date.now());
  await hudEdit(true);
}

/** Loads a preset: its places, then its switches and sizes. A preset never saved does nothing. */
export async function loadPreset(slot: number) {
  const l = ui.data.settings.overlayPresets[slot]?.layout;
  if (!l) return;
  let changed: HudLabel[] = [];
  await act(() => { changed = applyLayout(ui.data.settings, l); ui.data.settings.overlayPreset = slot; });
  await setOverlayPlaces(l.places);
  changed.forEach(applySwitch);
}

function stateOf(): HudState {
  const s = ui.data.settings;
  return {
    presets: s.overlayPresets.map((p) => ({ name: p.name, savedMs: p.layout?.savedMs ?? null })),
    active: s.overlayPreset,
    on: Object.fromEntries(HUD_OVERLAYS.map((o) => [o.label, !!s[o.setting]])),
  };
}

async function handle(c: HudCmd) {
  const s = ui.data.settings;
  switch (c.cmd) {
    case "toggle": {
      const o = HUD_OVERLAYS.find((x) => x.label === c.label);
      if (!o) break;
      await act(() => { s[o.setting] = c.on; });
      applySwitch(o.label);
      break;
    }
    case "rename":
      if (s.overlayPresets[c.slot]) await act(() => { s.overlayPresets[c.slot].name = cleanName(c.name, c.slot); });
      break;
    case "save": {
      if (!s.overlayPresets[c.slot]) break;
      const places = await overlayPlaces();
      await act(() => { s.overlayPresets[c.slot].layout = layoutOf(s, places, Date.now()); s.overlayPreset = c.slot; });
      break;
    }
    case "load":
      await loadPreset(c.slot);
      break;
    case "done":
      before = null;
      await hudEdit(false);
      break;
    case "cancel":
      if (before) {
        const b = before;
        let changed: HudLabel[] = [];
        await act(() => { changed = applyLayout(s, b); });
        changed.forEach(applySwitch);
      }
      before = null;
      await hudCancel();
      break;
  }
  await sendHudState(stateOf());
}

/** The main window listens for the panel and the tray (main.ts, desktop only). */
export async function wireHud() {
  await onHudCmd((c) => { handle(c).catch((e) => console.warn("Edit overlays", e)); });
  await onHudOpen(() => { openHud().catch((e) => console.warn("Edit overlays", e)); });
}
