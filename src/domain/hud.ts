// "Edit overlays" (like the game's Edit HUD): the overlays' layout presets. A preset = where each overlay is
// (and its size, for the ones sized by hand), which ones are on, and the cube / soul points popups' sizes. Pure.

/** The overlays, in the panel's order: `label` = the window (src-tauri/src/meter.rs `OVERLAYS`), `setting` = its switch. */
export const HUD_OVERLAYS = [
  { label: "overlay", name: "DPS meter", setting: "dpsOverlay" },
  { label: "events", name: "Event countdown", setting: "eventsOverlay" },
  { label: "cube", name: "Hidden cube popup", setting: "cubePopup" },
  { label: "radar", name: "Cube radar", setting: "radar" },
  { label: "net", name: "Ping and packet loss", setting: "netOverlay" },
  { label: "souls", name: "Soul points popup", setting: "soulPopup" },
] as const;
export type HudLabel = (typeof HUD_OVERLAYS)[number]["label"];
type Switch = (typeof HUD_OVERLAYS)[number]["setting"];
export const HUD_NAMES: Record<string, string> = Object.fromEntries(HUD_OVERLAYS.map((o) => [o.label, o.name]));

/** An overlay's spot and size, physical pixels (the Rust `places::Place`): size only for the ones sized by hand. */
export interface Place { x: number; y: number; w?: number; h?: number }
export interface HudLayout {
  places: [string, Place][];
  on: Partial<Record<HudLabel, boolean>>;
  cubeSize: number;
  soulSize: number;
  savedMs: number;
}
export interface OverlayPreset { name: string; layout?: HudLayout }

export const PRESET_COUNT = 6;
export const PRESET_NAME_MAX = 24;
export const defaultPresets = (): OverlayPreset[] => Array.from({ length: PRESET_COUNT }, (_, i) => ({ name: `Preset ${i + 1}` }));

type HudSettings = Record<Switch, boolean> & { cubePopupSize: number; soulPopupSize: number };

/** The settings' overlays now, as a layout with these places. */
export function layoutOf(s: HudSettings, places: [string, Place][], now: number): HudLayout {
  return {
    places: places.filter(([l]) => l in HUD_NAMES),
    on: Object.fromEntries(HUD_OVERLAYS.map((o) => [o.label, !!s[o.setting]])),
    cubeSize: s.cubePopupSize,
    soulSize: s.soulPopupSize,
    savedMs: now,
  };
}

/** A layout's switches and sizes into the settings (its places go to the windows, `infra/meter.ts` `setOverlayPlaces`).
 *  Returns the overlays whose switch changed. */
export function applyLayout(s: HudSettings, l: HudLayout): HudLabel[] {
  const changed: HudLabel[] = [];
  for (const o of HUD_OVERLAYS) {
    const on = l.on[o.label];
    if (typeof on === "boolean" && s[o.setting] !== on) { s[o.setting] = on; changed.push(o.label); }
  }
  if (l.cubeSize !== s.cubePopupSize) { s.cubePopupSize = l.cubeSize; if (!changed.includes("cube")) changed.push("cube"); }
  if (l.soulSize !== s.soulPopupSize) { s.soulPopupSize = l.soulSize; if (!changed.includes("souls")) changed.push("souls"); }
  return changed;
}

export const cleanName = (name: string, slot: number) => name.trim().slice(0, PRESET_NAME_MAX) || `Preset ${slot + 1}`;

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
function cleanPlace(p: any): Place | null {
  if (!p || !num(p.x) || !num(p.y)) return null;
  return { x: Math.round(p.x), y: Math.round(p.y), ...(num(p.w) && { w: Math.round(p.w) }), ...(num(p.h) && { h: Math.round(p.h) }) };
}
function cleanLayout(l: any): HudLayout | undefined {
  if (!l || typeof l !== "object" || !Array.isArray(l.places)) return undefined;
  const places = l.places.flatMap((e: any) => {
    const p = Array.isArray(e) && typeof e[0] === "string" && e[0] in HUD_NAMES ? cleanPlace(e[1]) : null;
    return p ? [[e[0], p] as [string, Place]] : [];
  });
  const on = Object.fromEntries(HUD_OVERLAYS.filter((o) => typeof l.on?.[o.label] === "boolean").map((o) => [o.label, l.on[o.label]]));
  return { places, on, cubeSize: num(l.cubeSize) ? l.cubeSize : 1, soulSize: num(l.soulSize) ? l.soulSize : 1, savedMs: num(l.savedMs) ? l.savedMs : 0 };
}
/** Six presets from a save (any shape): names kept, layouts checked field by field. */
export function cleanPresets(raw: unknown): OverlayPreset[] {
  const list = Array.isArray(raw) ? raw : [];
  return defaultPresets().map((d, i) => {
    const r = list[i];
    const layout = cleanLayout(r?.layout);
    return { name: typeof r?.name === "string" ? cleanName(r.name, i) : d.name, ...(layout && { layout }) };
  });
}
