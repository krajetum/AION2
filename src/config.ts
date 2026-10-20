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

/** Recurring event: starts at `minute` of every `everyHours`-th hour, counted from `firstHour` (RESET_CONFIG.timeZone). */
export interface GameEvent { id: string; name: string; everyHours: number; minute: number; firstHour: number }

export const EVENTS: GameEvent[] = [
  { id: "shugo", name: "Shugo Festival", everyHours: 1, minute: 0, firstHour: 0 },        // TO VERIFY
  { id: "invasion", name: "Dimensional Invasion", everyHours: 1, minute: 30, firstHour: 0 }, // TO VERIFY
  { id: "rift", name: "Spacetime Rift", everyHours: 3, minute: 0, firstHour: 0 },          // TO VERIFY (anchor hour)
];

/** Current season: end date (00:00 in RESET_CONFIG.timeZone). Source: the user's Oath Coin sheet (2026-10-20). */
export const SEASON = { name: "Season 1 Oath Coin", end: "2026-12-16" }; // TO VERIFY in game
