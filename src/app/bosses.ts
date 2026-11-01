// Field-boss alert use cases (Field Bosses tab): arm, disarm, and change an armed boss's alert.
import { BOSS_CHANNELS, cleanLeads } from "../domain/alerts.ts";
import { bossLabel } from "../domain/bosses.ts";
import type { AppData } from "../domain/types.ts";

/** Names a boss the game data doesn't name; empty = back to "Unknown boss". */
export function setBossName(data: AppData, bossId: number, v: string) {
  if (v.trim()) data.bossNames[bossId] = v.trim();
  else delete data.bossNames[bossId];
}

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

/** Arms the bosses that are on by default (BOSS_CHANNELS `armed`: Immortal Gartua), once each: 5 min before, every
 *  respawn. One the player turned off stays off. Returns true if anything changed. */
export function armDefaultBosses(data: AppData): boolean {
  let changed = false;
  for (const b of data.bosses) {
    if (data.bossDefaulted.includes(b.bossId)) continue;
    const label = bossLabel(b, data.bossNames).toLowerCase();
    if (!BOSS_CHANNELS.some((c) => c.armed && c.boss.toLowerCase() === label)) continue;
    data.bossAlerts[b.bossId] ??= { leads: [5], repeat: true };
    data.bossDefaulted.push(b.bossId);
    changed = true;
  }
  return changed;
}
