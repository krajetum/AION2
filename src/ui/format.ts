// Labels and number/time formatting shared by the pages.
import type { Cadence } from "../domain/types.ts";
import type { Tab } from "./state.svelte.ts";

/** Sidebar label and page header tagline. */
export const PAGE: Record<Tab, [string, string]> = {
  daily: ["Daily", "The grind never sleeps. You should, though."],
  weekly: ["Weekly", "Wednesday is coming."],
  monthly: ["Monthly", "Long-term commitment issues."],
  plan: ["Planner", "Limited minutes, unlimited greed. Knapsack go brrr."],
  season: ["Season Coins", "Oath Coin stonks. Numbers only go up."],
  dps: ["DPS Meter", "Numbers don't lie. Partymates do."],
  news: ["News", "Patch notes or it didn't happen."],
  settings: ["Settings", "Knobs. So many knobs."],
};
export const LABEL: Record<Cadence, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const PRIO = ["Low", "Normal", "High"];

export const num = (n: number) => n.toLocaleString("en-US");
export const pad = (n: number) => String(n).padStart(2, "0");
/** Local "HH:MM". */
export const hm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const mins = (m: number) => (m < 1 ? "<1 min" : `${Math.round(m)} min`);
