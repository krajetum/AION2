import type { ArenaLog } from "./arena.ts";
import type { BossTimer } from "./meter.ts";

export type Cadence = "daily" | "weekly" | "monthly";
export const CADENCES: Cadence[] = ["daily", "weekly", "monthly"];

/** Numeric goal: "Abyss 2000 mob" → {target:2000}; levels 5..50 → {target:50, step:5}. */
export interface Goal { label?: string; target: number; step?: number }

export interface Task {
  id: string;
  cadence: Cadence;
  category: string;
  name: string;
  note?: string;
  enabled: boolean;
  order: number;
  goals?: Goal[];
  minutes?: number;  // Planner estimate for the whole task, learned while a session runs
  priority?: number; // Planner value: 1 low · 2 normal (default) · 3 high
}

export interface Character { id: string; name: string }

/** A field boss's respawn alert: minutes before (1–3 leads); repeat = every respawn the map reports, else once. */
export interface BossAlert { leads: number[]; repeat: boolean }

/** counts[i] matches the Task's goals[i]. */
export interface Progress { done: boolean; counts?: number[] }

/** Per-notification settings: on = send it, volume = 0..100 share of the master volume, muted = silent toast. */
export interface Channel { on: boolean; volume: number; muted: boolean; leads?: number[] } // leads: event alerts, minutes before start

export interface Settings {
  warnHours: Record<Cadence, number>;
  quietStart: string; // "HH:MM"
  quietEnd: string;   // "HH:MM"
  mutedUntil: number; // epoch ms
  channels: Record<string, Channel>; // cloud | <event id> | reset | news | check (see CHANNELS in notify.ts)
  sound: boolean;  // master switch: play public/sounds/*.wav with each toast
  volume: number;  // master volume 0..100
  memeMascot: boolean; // show the corner meme (src/memes/mascot)
  planMinutes: number;   // Planner: session length
  planNextHours: number; // Planner: hours until the next session (tasks resetting before it are urgent)
  dpsOverlay: boolean;     // DPS overlay on: shows during fights, hides when idle
  dpsIdleSeconds: number;  // DPS meter: seconds without activity before the fight resets (0 = never)
}

/** One undo step: the progress of each touched task before the change (null = it had none). */
export interface UndoEntry { charId: string; label: string; at: number; before: Record<string, Progress | null> }

/** Running Planner session. lastMark = last progress tick, used to time the next one. */
export interface ActivePlan { charId: string; start: number; minutes: number; lastMark: number }

/** Item from the official AION 2 Steam news feed. date = epoch seconds. */
export interface NewsItem { gid: string; title: string; url: string; date: number; contents: string; read?: boolean }

/** Season Oath Coin progress per character, keyed by mission name (src/season.ts). */
export interface SeasonProgress {
  coins: number;    // current coins
  thisWeek: number; // still to claim this week
  claimed: Record<string, number>;   // seasonal mission → coins already claimed
  hardPvp: Record<string, boolean>;  // override of the mission's Hard PvP default
  excluded: Record<string, boolean>; // weekly missions left out of the projection
}

export interface AppData {
  version: 1;
  tasks: Task[];
  characters: Character[];
  progress: Record<string, Record<string, Progress>>; // charId → taskId → Progress
  lastReset: Record<Cadence, number>; // epoch ms of the last applied reset
  warned: Record<Cadence, number>;    // boundary already warned about
  lastCloudHour: number;              // hour (epoch ms) of the last Cloud Merchant reminder
  warnedEvent: Record<string, number>; // event id → start already warned about
  news: NewsItem[];                   // last fetched news, newest first
  lastNewsGid: string;                // newest gid already toasted
  season: Record<string, SeasonProgress>; // charId → season progress
  bosses: BossTimer[];                // field bosses from the maps last opened in game (src/domain/bosses.ts)
  bossAlerts: Record<string, BossAlert>; // world-map boss id → its respawn alert
  arena: ArenaLog;                    // arena matchup log (src/domain/arena.ts)
  plan?: ActivePlan;
  undo: UndoEntry[]; // newest last, max 30 (src/undo.ts)
  settings: Settings;
}
