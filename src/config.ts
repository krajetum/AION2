// =====================================================================
//  EU SERVER TIMES — THE ONLY PLACE TO EDIT THEM
//  Every value below is TO VERIFY in game (from guides, not official).
//  Times are wall-clock times in the given time zone (DST handled).
// =====================================================================

export interface ResetConfig {
  timeZone: string;
  daily: { hour: number; minute: number };
  /** weekday: 0 = Sunday, 1 = Monday, ... 6 = Saturday */
  weekly: { weekday: number; hour: number; minute: number };
  /** day > days in the month → last day of the month */
  monthly: { day: number; hour: number; minute: number };
  /** minute of each hour when the Cloud Merchant restocks */
  cloudMerchantMinute: number;
}

export const RESET_CONFIG: ResetConfig = {
  timeZone: "UTC",
  daily: { hour: 7, minute: 0 },              // TO VERIFY (guides: 07:00 UTC)
  weekly: { weekday: 3, hour: 7, minute: 0 }, // TO VERIFY (guides: Wednesday 07:00 UTC)
  monthly: { day: 1, hour: 7, minute: 0 },    // TO VERIFY
  cloudMerchantMinute: 0,                     // TO VERIFY
};

/** Recurring event: starts at `minute` of every `everyHours`-th hour, counted from `firstHour` (RESET_CONFIG.timeZone).
 *  duration = minutes the Planner reserves for it. */
export interface GameEvent { id: string; name: string; everyHours: number; minute: number; firstHour: number; duration: number; /** wall clock of this event, if not RESET_CONFIG.timeZone */ timeZone?: string }

export const EVENTS: GameEvent[] = [
  { id: "shugo", name: "Shugo Festival", everyHours: 1, minute: 0, firstHour: 0, duration: 10 },        // TO VERIFY (time + duration)
  { id: "invasion", name: "Dimensional Invasion", everyHours: 1, minute: 30, firstHour: 0, duration: 10 }, // TO VERIFY (time + duration)
  // 02:00, 05:00 … Paris time, DST included: guides 2:00 CEST in Oct, a player saw 11:00 CET on 2026-11-09 (a fixed UTC grid is off by 1 h in winter)
  { id: "rift", name: "Spacetime Rift", everyHours: 3, minute: 0, firstHour: 2, duration: 15, timeZone: "Europe/Paris" }, // TO VERIFY (duration)
];

/** The crowd Worker (server/): shared boss timers and cube spots.
 *  `VITE_CROWD_URL=http://localhost:8787 npm run dev` points the browser preview at `wrangler dev`. */
export const CROWD_URL = "https://aion2-companion.krajetum.workers.dev";

/** Sentry crash reports (infra/sentry.ts), sent only when the player turns them on in Settings.
 *  Empty = off for everyone. `VITE_SENTRY_DSN` overrides it. A DSN can only send events, so it is safe here. */
export const SENTRY_DSN = "https://0afd49e981b62ffdc003ce13d30dc2be@o4512380557328384.ingest.de.sentry.io/4512380746661968";

/** Current season: end date (00:00 in RESET_CONFIG.timeZone). Source: the user's Oath Coin sheet (2026-10-20). */
export const SEASON = { name: "Season 1 Oath Coin", end: "2026-12-16" }; // TO VERIFY in game
