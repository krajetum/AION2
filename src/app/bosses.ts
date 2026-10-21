// Field-boss alert use cases (Field Bosses tab): arm, disarm, and change an armed boss's alert.
import { cleanLeads } from "../domain/alerts.ts";
import type { AppData } from "../domain/types.ts";

/** Arms a boss (5 min before, once) or disarms it. */
export function toggleBossAlert(data: AppData, bossId: number) {
  if (data.bossAlerts[bossId]) delete data.bossAlerts[bossId];
  else data.bossAlerts[bossId] = { leads: [5], repeat: false };
}

export function setBossRepeat(data: AppData, bossId: number, on: boolean) { data.bossAlerts[bossId].repeat = on; }

/** Adds the first of 10/5/3/2/1 min not used yet (max 3 leads). */
export function addBossLead(data: AppData, bossId: number) {
  const a = data.bossAlerts[bossId];
  a.leads = cleanLeads([...a.leads, [10, 5, 3, 2, 1].find((m) => !a.leads.includes(m))]);
}
export function removeBossLead(data: AppData, bossId: number, i: number) { data.bossAlerts[bossId].leads.splice(i, 1); }
export function setBossLead(data: AppData, bossId: number, i: number, v: string) {
  const a = data.bossAlerts[bossId], leads = [...a.leads];
  leads[i] = Math.max(1, Math.min(60, Math.round(+v) || 1));
  a.leads = cleanLeads(leads);
}
