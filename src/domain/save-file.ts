// Save-file rules: the default data and the migration of old or imported saves. Pure.
import { EVENTS } from "../config.ts";
import { CHANNELS, cleanLeads } from "./alerts.ts";
import { seedTasks } from "./seed.ts";
import type { AppData, Channel } from "./types.ts";

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
    undo: [],
    settings: {
      warnHours: { daily: 2, weekly: 12, monthly: 24 },
      quietStart: "01:00",
      quietEnd: "09:00",
      mutedUntil: 0,
      channels: Object.fromEntries(CHANNELS.map((c): [string, Channel] =>
        [c.id, { on: c.on, volume: 100, muted: false, ...(EVENTS.some((ev) => ev.id === c.id) && { leads: [5] }) }])),
      sound: true,
      volume: 70,
      memeMascot: true,
      planMinutes: 40,
      planNextHours: 20,
    },
  };
}

/** Fills missing fields with defaults (old or imported data). */
export function normalize(raw: any): AppData {
  if (!raw || !Array.isArray(raw.tasks) || !Array.isArray(raw.characters) || !raw.characters.length)
    throw new Error("Invalid file: tasks or characters are missing");
  const d = defaultData();
  // Older saves had cloudReminder / eventAlerts instead of channels.
  const { cloudReminder, eventAlerts, ...rs } = raw.settings ?? {};
  const channels = d.settings.channels;
  if (typeof cloudReminder === "boolean") channels.cloud.on = cloudReminder;
  for (const [id, on] of Object.entries(eventAlerts ?? {})) if (channels[id]) channels[id].on = !!on;
  for (const [id, c] of Object.entries(rs.channels ?? {})) channels[id] = { ...channels[id], ...(c as Channel) };
  for (const ev of EVENTS) if (channels[ev.id]) channels[ev.id].leads = cleanLeads(channels[ev.id].leads);
  return {
    ...d, ...raw,
    progress: raw.progress ?? {},
    lastReset: { ...d.lastReset, ...raw.lastReset },
    warned: { ...d.warned, ...raw.warned },
    warnedEvent: raw.warnedEvent ?? {},
    news: Array.isArray(raw.news) ? raw.news : [],
    season: raw.season ?? {},
    undo: Array.isArray(raw.undo) ? raw.undo : [],
    settings: { ...d.settings, ...rs, warnHours: { ...d.settings.warnHours, ...rs.warnHours }, channels },
  };
}
