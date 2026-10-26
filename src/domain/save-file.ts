// Save-file rules: the default data and the migration of old or imported saves. Pure.
import { CHANNELS, cleanLeads, LEAD_CHANNELS } from "./alerts.ts";
import { cleanMap, emptyMap } from "./map.ts";
import { cleanCollections } from "./pets.ts";
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
    bosses: [],
    bossAlerts: {},
    bossNames: {},
    arena: { matches: [], maps: {}, kills: [] },
    map: emptyMap(),
    pets: {},
    undo: [],
    install: crypto.randomUUID(),
    serverId: null,
    settings: {
      warnHours: { daily: 2, weekly: 12, monthly: 24 },
      quietStart: "01:00",
      quietEnd: "09:00",
      mutedUntil: 0,
      channels: Object.fromEntries(CHANNELS.map((c): [string, Channel] =>
        [c.id, { on: c.on, volume: 100, muted: false, ...(LEAD_CHANNELS.includes(c.id) && { leads: [5] }) }])),
      sound: true,
      volume: 70,
      birthdayVolume: 50,
      planMinutes: 40,
      planNextHours: 20,
      dpsOverlay: false,
      dpsIdleSeconds: 15,
      overlayFollowGame: true,
      overlayOpacity: 90,
      eventsOverlay: false,
      cubePopup: false,
      cubePopupSize: 1,
      radar: false,
      radarRange: 100,
      radarMap: true,
      radarRound: true,
      crowdShare: true,
    },
  };
}

/** Fills missing fields with defaults (old or imported data). */
export function normalize(raw: any): AppData {
  if (!raw || !Array.isArray(raw.tasks) || !Array.isArray(raw.characters) || !raw.characters.length)
    throw new Error("Invalid file: tasks or characters are missing");
  const d = defaultData();
  // Older saves had cloudReminder / eventAlerts instead of channels, and a memeMascot switch.
  const { cloudReminder, eventAlerts, memeMascot, ...rs } = raw.settings ?? {};
  const channels = d.settings.channels;
  if (typeof cloudReminder === "boolean") channels.cloud.on = cloudReminder;
  for (const [id, on] of Object.entries(eventAlerts ?? {})) if (channels[id]) channels[id].on = !!on;
  for (const [id, c] of Object.entries(rs.channels ?? {})) channels[id] = { ...channels[id], ...(c as Channel) };
  for (const [id, c] of Object.entries(channels)) {
    if (LEAD_CHANNELS.includes(id)) c.leads = cleanLeads(c.leads);
    else delete c.leads; // the boss channel had leads before its alerts moved to each boss
  }
  return {
    ...d, ...raw,
    progress: raw.progress ?? {},
    lastReset: { ...d.lastReset, ...raw.lastReset },
    warned: { ...d.warned, ...raw.warned },
    warnedEvent: raw.warnedEvent ?? {},
    news: Array.isArray(raw.news) ? raw.news : [],
    season: raw.season ?? {},
    bosses: Array.isArray(raw.bosses) ? raw.bosses : [],
    bossNames: Object.fromEntries(Object.entries(raw.bossNames ?? {}).filter(([, v]) => typeof v === "string" && v.trim()) as [string, string][]),
    bossAlerts: Object.fromEntries(Object.entries(raw.bossAlerts ?? {}).map(([id, a]: [string, any]) =>
      [id, { leads: cleanLeads(a?.leads), repeat: !!a?.repeat }])),
    arena: { matches: Array.isArray(raw.arena?.matches) ? raw.arena.matches : [], maps: raw.arena?.maps ?? {},
      kills: Array.isArray(raw.arena?.kills) ? raw.arena.kills.filter((k: any) => k?.other && Number.isFinite(k.atMs)) : [] },
    map: cleanMap(raw.map),
    pets: cleanCollections(raw.pets),
    undo: Array.isArray(raw.undo) ? raw.undo : [],
    install: typeof raw.install === "string" && raw.install ? raw.install : d.install,
    serverId: Number.isInteger(raw.serverId) ? raw.serverId : null,
    settings: { ...d.settings, ...rs, warnHours: { ...d.settings.warnHours, ...rs.warnHours }, channels },
  };
}
