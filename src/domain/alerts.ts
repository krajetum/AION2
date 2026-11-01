// Event alert lead times, notification channels, volume and quiet hours. Pure: tested with `npm test`.
import { EVENTS } from "../config.ts";
import type { Settings } from "./types.ts";

/** Event alert lead times (minutes): unique ints 1..60, longest first, max 3; nothing valid → [5]. */
export function cleanLeads(leads: unknown): number[] {
  const ok = (Array.isArray(leads) ? leads : []).map(Math.round).filter((n) => n >= 1 && n <= 60);
  const out = [...new Set(ok)].sort((a, b) => b - a).slice(0, 3);
  return out.length ? out : [5];
}

/** Lead times now due (msLeft ≤ lead) and not yet warned. The caller marks them all and toasts once. */
export const dueLeads = (leads: number[], msLeft: number, warned: (lead: number) => boolean) =>
  leads.filter((l) => msLeft <= l * 60_000 && !warned(l));

/** Field bosses with their own sound and volume (public/sounds/<id>.wav), by the name the Field Bosses page shows;
 *  their alerts are armed per boss like the others. Immortal Gartua: the player's own recording (2026-11-01). */
export const BOSS_CHANNELS = [{ boss: "Immortal Gartua", id: "gartua" }];

/** The channel a field boss's respawn alert uses: its own if it has one, else "boss". */
export const bossChannel = (label: string) => BOSS_CHANNELS.find((b) => b.boss.toLowerCase() === label.trim().toLowerCase())?.id ?? "boss";

/** Notification sounds: files in public/sounds/<name>.wav (bundled into the app). Replace them with your own,
 *  same names. Each event uses <event id>.wav (see EVENTS in config.ts), else event.wav.
 *  A missing or broken file falls back to the next name, then default.wav.
 *  Each channel = one row in Settings → Notifications (on/off, volume, mute); id = settings.channels key. */
export const CHANNELS = [
  { id: "cloud", name: "Hourly Cloud Merchant reminder", sound: ["cloud"], on: true },
  ...EVENTS.map((ev) => ({ id: ev.id, name: `${ev.name}: alert before`, sound: [ev.id, "event"], on: false })),
  { id: "boss", name: "Field boss alerts (set per boss in Field Bosses)", sound: ["boss", "event"], on: true },
  ...BOSS_CHANNELS.map((b) => ({ id: b.id, name: `${b.boss}: respawn alert (set in Field Bosses)`, sound: [b.id, "boss", "event"], on: true })),
  { id: "reset", name: "Reset warnings", sound: ["reset"], on: true },
  { id: "news", name: "News", sound: ["news"], on: true },
  { id: "check", name: "Task checked (vine boom)", sound: ["check"], on: true },
  { id: "auto", name: "Task ticked by the game (auto-tracked tasks)", sound: ["auto", "check"], on: true },
  { id: "cube", name: "Hidden cube popup", sound: ["cube"], on: true },
];

/** Channels with alert lead times: the events (field bosses have theirs per boss, AppData.bossAlerts). */
export const LEAD_CHANNELS = EVENTS.map((ev) => ev.id);

/** Master volume × channel volume; 0 when the master switch is off or the channel is muted. */
export const channelVolume = (s: Settings, id: string) => {
  const c = s.channels[id];
  return !s.sound || c?.muted ? 0 : s.volume * (c?.volume ?? 100) / 100;
};

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };

/** Quiet hours in the PC's local time (start > end = spans midnight). */
export function inQuietHours(s: Settings, now: number) {
  const d = new Date(now);
  const cur = d.getHours() * 60 + d.getMinutes(), a = toMin(s.quietStart), b = toMin(s.quietEnd);
  if (a === b) return false;
  return a < b ? cur >= a && cur < b : cur >= a || cur < b;
}
