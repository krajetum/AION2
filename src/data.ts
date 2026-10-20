// Persistence (plugin-store → data.json in the app data folder) + JSON backup.
// Outside Tauri (plain browser on `npm run dev`) it falls back to localStorage,
// so the UI can be previewed and tested in a normal browser.
import { isTauri } from "@tauri-apps/api/core";
import { load, type Store } from "@tauri-apps/plugin-store";
import { CHANNELS } from "./notify.ts";
import { seedTasks } from "./seed.ts";
import type { AppData, Channel } from "./types.ts";

const LS_KEY = "aion2-companion-data";
let store: Store | undefined;

export function defaultData(): AppData {
  return {
    version: 1,
    tasks: seedTasks(),
    characters: [{ id: crypto.randomUUID(), name: "Main" }],
    progress: {},
    lastReset: { daily: 0, weekly: 0, monthly: 0 },
    warned: { daily: 0, weekly: 0, monthly: 0 },
    lastCloudHour: 0,
    warnedEvent: {},
    news: [],
    lastNewsGid: "",
    season: {},
    settings: {
      warnHours: { daily: 2, weekly: 12, monthly: 24 },
      quietStart: "01:00",
      quietEnd: "09:00",
      mutedUntil: 0,
      channels: Object.fromEntries(CHANNELS.map((c): [string, Channel] => [c.id, { on: c.on, volume: 100, muted: false }])),
      sound: true,
      volume: 70,
      memeMascot: true,
    },
  };
}

/** Fills missing fields with defaults (old or imported data). */
function normalize(raw: any): AppData {
  if (!raw || !Array.isArray(raw.tasks) || !Array.isArray(raw.characters) || !raw.characters.length)
    throw new Error("Invalid file: tasks or characters are missing");
  const d = defaultData();
  // Older saves had cloudReminder / eventAlerts instead of channels.
  const { cloudReminder, eventAlerts, ...rs } = raw.settings ?? {};
  const channels = d.settings.channels;
  if (typeof cloudReminder === "boolean") channels.cloud.on = cloudReminder;
  for (const [id, on] of Object.entries(eventAlerts ?? {})) if (channels[id]) channels[id].on = !!on;
  for (const [id, c] of Object.entries(rs.channels ?? {})) channels[id] = { ...channels[id], ...(c as Channel) };
  return {
    ...d, ...raw,
    progress: raw.progress ?? {},
    lastReset: { ...d.lastReset, ...raw.lastReset },
    warned: { ...d.warned, ...raw.warned },
    warnedEvent: raw.warnedEvent ?? {},
    news: Array.isArray(raw.news) ? raw.news : [],
    season: raw.season ?? {},
    settings: { ...d.settings, ...rs, warnHours: { ...d.settings.warnHours, ...rs.warnHours }, channels },
  };
}

export async function loadData(): Promise<AppData> {
  let raw: unknown;
  if (isTauri()) {
    store = await load("data.json", { autoSave: false, defaults: {} });
    raw = await store.get<AppData>("data");
  } else {
    const s = localStorage.getItem(LS_KEY);
    raw = s && JSON.parse(s);
  }
  return raw ? normalize(raw) : defaultData();
}

export async function saveData(data: AppData) {
  if (!store) return localStorage.setItem(LS_KEY, JSON.stringify(data));
  await store.set("data", data);
  await store.save();
}

export function exportJson(data: AppData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `aion2-companion-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function importJson(file: File): Promise<AppData> {
  return normalize(JSON.parse(await file.text()));
}
