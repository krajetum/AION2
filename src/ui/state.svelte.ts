// UI state. `ui.data` is a deep $state proxy of the save file: app/ use cases mutate it and the page updates.
import { SvelteSet } from "svelte/reactivity";
import type { FightRecord, RecentFight } from "../domain/fights.ts";
import type { GuildView } from "../domain/guild.ts";
import type { MeterUpdate } from "../domain/meter.ts";
import type { MeterEvent, Trigger } from "../domain/triggers.ts";
import type { Cue } from "../domain/mascot.ts";
import { CADENCES, type AppData, type Cadence } from "../domain/types.ts";

export type Tab = "home" | Cadence | "plan" | "season" | "crafting" | "enhance" | "bosses" | "map" | "pets" | "dps" | "fights" | "arena" | "players" | "guild" | "wiki" | "news" | "settings";
export const TABS: Tab[] = ["home", ...CADENCES, "plan", "season", "crafting", "enhance", "bosses", "map", "pets", "dps", "fights", "arena", "players", "guild", "wiki", "news", "settings"];
/** Sidebar groups, between Home (top), Wiki (after them) and News / Settings (footer). */
export const GROUPS: [string, Tab[]][] = [["Tasks", [...CADENCES]], ["Plan", ["plan", "season"]], ["Gear", ["crafting", "enhance"]],
  ["World", ["bosses", "map", "pets"]], ["Combat", ["dps", "fights", "arena"]], ["Social", ["players", "guild"]]];
/** The four wiki pages before they became one (old #hashes). */
const OLD_WIKI = ["expeditions", "transcendence", "sanctuary", "mechanics"];
export const tabFromHash = (): Tab => {
  const h = location.hash.slice(1) as Tab;
  return TABS.includes(h) ? h : OLD_WIKI.includes(h) ? "wiki" : "home";
};

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
  recent: [] as MeterEvent[], // what the meter saw in the last minutes (main.ts): offered as tasks' triggers
  suggest: null as { taskId: string; triggers: Trigger[] } | null, // after a manual tick: tick it by itself next time?
  recentFights: [] as RecentFight[], // the DPS page's last targets, newest first (memory only: src/domain/fights.ts addRecent)
  fights: [] as FightRecord[], // the Fight Log, newest first (its own file: src/infra/fights.ts)
  lookup: null as { name: string; serverId: number } | null, // a player card's "Full profile": the Players page searches it
  mascotCues: [] as Cue[], // the alerts the mascot reacts to (main.ts), latest last
  guild: null as GuildView | null, // the guild as the Worker last answered (main.ts syncs it while playing), not saved
  updating: "", // the update in progress or its error, shown in the update banner
  update: undefined as { version: string; install: () => Promise<void> } | undefined, // a newer release (main.ts checkUpdate), offered by a banner
});

/** Tasks finished from the Planner page: kept on screen (ticked) so the tick is visible and can be undone. */
export const doneHere = new SvelteSet<string>();
/** Expanded news gids, kept when leaving the News page. */
export const openNews = new Set<string>();

/** Plain copy of the save file for storage (the store plugin can't take a proxy). */
export const snapshot = () => $state.snapshot(ui.data) as AppData;
/** Plain copy of the Fight Log for storage. */
export const fightsSnapshot = () => $state.snapshot(ui.fights) as FightRecord[];
