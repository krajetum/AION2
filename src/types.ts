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
}

export interface Character { id: string; name: string }

/** counts[i] matches the Task's goals[i]. */
export interface Progress { done: boolean; counts?: number[] }

/** Per-notification settings: on = send it, volume = 0..100 share of the master volume, muted = silent toast. */
export interface Channel { on: boolean; volume: number; muted: boolean }

export interface Settings {
  warnHours: Record<Cadence, number>;
  quietStart: string; // "HH:MM"
  quietEnd: string;   // "HH:MM"
  mutedUntil: number; // epoch ms
  channels: Record<string, Channel>; // cloud | <event id> | reset | news | check (see CHANNELS in notify.ts)
  sound: boolean;  // master switch: play public/sounds/*.wav with each toast
  volume: number;  // master volume 0..100
  memeMascot: boolean; // show the corner meme (src/memes/mascot)
}

/** Item from the official AION 2 Steam news feed. date = epoch seconds. */
export interface NewsItem { gid: string; title: string; url: string; date: number; contents: string; read?: boolean }

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
  settings: Settings;
}
