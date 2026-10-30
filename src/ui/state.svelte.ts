// UI state. `ui.data` is a deep $state proxy of the save file: app/ use cases mutate it and the page updates.
import { SvelteSet } from "svelte/reactivity";
import type { MeterUpdate } from "../domain/meter.ts";
import { CADENCES, type AppData, type Cadence } from "../domain/types.ts";

export type Tab = "home" | Cadence | "plan" | "season" | "bosses" | "map" | "pets" | "dps" | "arena" | "expeditions" | "transcendence" | "mechanics" | "news" | "settings";
export const TABS: Tab[] = ["home", ...CADENCES, "plan", "season", "bosses", "map", "pets", "dps", "arena", "expeditions", "transcendence", "mechanics", "news", "settings"];
/** Sidebar groups. */
export const GROUPS: [string, Tab[]][] = [["Overview", ["home"]], ["Tasks", [...CADENCES]], ["Progress", ["plan", "season"]],
  ["World", ["bosses", "map", "pets"]], ["Combat", ["dps", "arena"]], ["Wiki", ["expeditions", "transcendence", "mechanics"]], ["Info", ["news", "settings"]]];
export const tabFromHash = (): Tab => { const h = location.hash.slice(1) as Tab; return TABS.includes(h) ? h : "home"; };

export const ui = $state({
  data: undefined as unknown as AppData, // set by main.ts before mounting
  charId: "",
  tab: tabFromHash(), // the page lives in the URL hash so a reload keeps it
  editing: false,
  autostart: false,
  newsError: "",
  now: Date.now(), // 1 s clock (main.ts) for countdowns and live times
  overlay: false, // DPS overlay window open (main.ts follows the "meter-overlay" event)
  meter: undefined as MeterUpdate | undefined, // last meter update (the capture runs from app start, main.ts)
});

/** Tasks finished from the Planner page: kept on screen (ticked) so the tick is visible and can be undone. */
export const doneHere = new SvelteSet<string>();
/** Expanded news gids, kept when leaving the News page. */
export const openNews = new Set<string>();

/** Plain copy of the save file for storage (the store plugin can't take a proxy). */
export const snapshot = () => $state.snapshot(ui.data) as AppData;
