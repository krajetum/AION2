// Settings use cases: the clamped number fields, mute, event alert lead times, news read flags.
import { cleanLeads } from "../domain/alerts.ts";
import type { AppData, Cadence } from "../domain/types.ts";

const HOUR = 3600_000;

export function muteForAnHour(data: AppData, now: number) { data.settings.mutedUntil = now + HOUR; }
export function unmute(data: AppData) { data.settings.mutedUntil = 0; }

export function setPlanMinutes(data: AppData, v: string) { data.settings.planMinutes = Math.max(5, Math.min(600, Math.round(+v) || 40)); }
export function setPlanNextHours(data: AppData, v: string) { data.settings.planNextHours = Math.max(1, Math.min(168, Math.round(+v) || 20)); }
export function setOverlayOpacity(data: AppData, v: string) { data.settings.overlayOpacity = Math.max(20, Math.min(100, Math.round(+v) || 90)); }
/** 0 = never reset; at most an hour. */
export function setDpsIdleSeconds(data: AppData, v: string) { data.settings.dpsIdleSeconds = Math.max(0, Math.min(3600, Math.round(+v) || 0)); }
export function setVolume(data: AppData, v: string) { data.settings.volume = Math.max(0, Math.min(100, +v || 0)); }
export function setWarnHours(data: AppData, cad: Cadence, v: string) { data.settings.warnHours[cad] = Math.max(0, +v || 0); }

export function setChannelOn(data: AppData, id: string, on: boolean) { data.settings.channels[id].on = on; }
export function setChannelVolume(data: AppData, id: string, v: string) { data.settings.channels[id].volume = Math.max(0, Math.min(100, +v || 0)); }
export function toggleChannelMute(data: AppData, id: string) { data.settings.channels[id].muted = !data.settings.channels[id].muted; }

/** Adds the first of 10/5/3/2/1 min not used yet (max 3 leads). */
export function addLead(data: AppData, id: string) {
  const ch = data.settings.channels[id];
  ch.leads = cleanLeads([...ch.leads!, [10, 5, 3, 2, 1].find((m) => !ch.leads!.includes(m))]);
}
export function removeLead(data: AppData, id: string, i: number) { data.settings.channels[id].leads!.splice(i, 1); }
/** A duplicate collapses into one lead. */
export function setLead(data: AppData, id: string, i: number, v: string) {
  const ch = data.settings.channels[id], leads = [...ch.leads!];
  leads[i] = Math.max(1, Math.min(60, Math.round(+v) || 1));
  ch.leads = cleanLeads(leads);
}

export function markNewsRead(data: AppData, gid: string | undefined) {
  const n = data.news.find((x) => x.gid === gid);
  if (n) n.read = true;
}
export function markAllNewsRead(data: AppData) { data.news.forEach((n) => (n.read = true)); }
