// Labels and number/time formatting shared by the pages.
import type { Cadence } from "../domain/types.ts";
import type { Tab } from "./state.svelte.ts";

/** Sidebar label and page header tagline. */
export const PAGE: Record<Tab, [string, string]> = {
  home: ["Home", "Your day at a glance."],
  daily: ["Daily", "Tasks that reset every day."],
  weekly: ["Weekly", "Tasks that reset every week."],
  monthly: ["Monthly", "Tasks that reset every month."],
  plan: ["Planner", "Best use of the minutes you have."],
  season: ["Season Coins", "Season Oath Coins: claimed, left and projected."],
  crafting: ["Crafting", "Recipes, what to craft, what to buy and the Kina it costs."],
  enhance: ["Enhancement", "What taking a Unique piece to +15 costs, on average and when unlucky."],
  bosses: ["Field Bosses", "Respawn timers from the world map."],
  map: ["Map", "Hidden cubes and where pets' soul points drop."],
  pets: ["Pets", "Your pet collection: what is left to collect, and where."],
  dps: ["DPS Meter", "Live damage, healing and damage taken."],
  fights: ["Fight Log", "Every boss fight: personal bests and runs side by side."],
  arena: ["Arena Log", "Every arena match and opponent."],
  expeditions: ["Expeditions", "Exploration, Conquest and Hard: requirements, drops, bosses."],
  transcendence: ["Transcendence", "Stages, Arcana and boss mechanics."],
  mechanics: ["Dungeon Rules", "Odyle Energy, weekly limits, guaranteed rewards, stagger."],
  news: ["News", "Official announcements from Steam."],
  settings: ["Settings", "Characters, notifications and data."],
};
export const LABEL: Record<Cadence, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const PRIO = ["Low", "Normal", "High"];

export const num = (n: number) => n.toLocaleString("en-US");
export const pad = (n: number) => String(n).padStart(2, "0");
/** Local "HH:MM". */
export const hm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const mins = (m: number) => (m < 1 ? "<1 min" : `${Math.round(m)} min`);
