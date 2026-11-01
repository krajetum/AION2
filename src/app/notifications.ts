// Decides which notifications are due: Cloud Merchant reminder, event alerts and warnings before resets.
// The toast itself is passed in (infra/notifier.ts), so this stays free of Tauri.
import { EVENTS, RESET_CONFIG as C } from "../config.ts";
import { bossChannel, dueLeads, inQuietHours } from "../domain/alerts.ts";
import { bossKey, bossLabel, dueBossAlerts } from "../domain/bosses.ts";
import { CLOUD_MERCHANT_ID } from "../domain/seed.ts";
import { remaining } from "../domain/tasks.ts";
import { nextBoundary, nextEvent } from "../domain/time.ts";
import { CADENCES, type AppData, type Settings } from "../domain/types.ts";

export type Toast = (s: Settings, title: string, body: string, sound: string[]) => void;

const H = 3600_000;

/** Returns true if it changed data (needs saving). */
export function checkNotifications(data: AppData, now: number, toast: Toast): boolean {
  const s = data.settings;
  const silent = s.mutedUntil > now || inQuietHours(s, now);
  let changed = false;

  // Cloud Merchant: once per hourly restock, only if recent (no stale toasts at startup).
  // ponytail: assumes a whole-hour zone offset (true for UTC).
  const off = C.cloudMerchantMinute * 60_000;
  const hour = Math.floor((now - off) / H) * H + off;
  const cloud = data.tasks.find((t) => t.id === CLOUD_MERCHANT_ID);
  if (hour > data.lastCloudHour) {
    data.lastCloudHour = hour;
    changed = true;
    if (s.channels.cloud?.on && cloud?.enabled && !silent && now - hour < 5 * 60_000)
      toast(s, "Cloud Merchant", "Cloud Merchant restocked. Theostones won't buy themselves.", ["cloud"]);
  }

  // Event alerts at each lead time, once per start and lead (missed while silent = skipped, it is short-lived).
  for (const ev of EVENTS) {
    const ch = s.channels[ev.id], next = nextEvent(ev, now, C.timeZone);
    if (!ch?.on) continue;
    const due = dueLeads(ch.leads ?? [5], next - now, (l) => data.warnedEvent[`${ev.id}@${l}`] === next);
    if (!due.length) continue;
    for (const l of due) data.warnedEvent[`${ev.id}@${l}`] = next;
    changed = true;
    if (!silent) toast(s, ev.name, `Starts in ${Math.max(1, Math.round((next - now) / 60_000))} min.`, [ev.id, "event"]);
  }

  // Field-boss respawns the user armed (Field Bosses tab), from the maps last opened in game: like the events.
  // A one-time alert is done after its shortest lead; a recurrent one waits for the next respawn the map reports.
  // A boss with its own channel (BOSS_CHANNELS: Immortal Gartua) uses its switch, sound and volume.
  for (const d of dueBossAlerts(data.bosses, data.bossAlerts, data.warnedEvent, now)) {
    const label = bossLabel(d.boss, data.bossNames), ch = bossChannel(label);
    if (!s.channels[ch]?.on) continue;
    for (const l of d.leads) data.warnedEvent[`${bossKey(d.boss)}@${l}`] = d.boss.timeMs;
    if (d.last && !d.alert.repeat) delete data.bossAlerts[d.boss.bossId];
    changed = true;
    if (!silent) toast(s, label, `Respawns in ${d.minutes} min.`, ch === "boss" ? ["boss", "event"] : [ch, "boss", "event"]);
  }

  // Warning X hours before each reset, once per reset. While silent it is not marked as sent,
  // so it fires when quiet hours end if the reset hasn't happened yet.
  for (const cad of CADENCES) {
    const next = nextBoundary(cad, now, C);
    if (silent || !s.channels.reset?.on || data.warned[cad] === next || next - now > s.warnHours[cad] * H) continue;
    data.warned[cad] = next;
    changed = true;
    const left = remaining(data, cad).filter((r) => r.left > 0);
    const total = left.reduce((n, r) => n + r.left, 0);
    if (total > 0) {
      const hrs = Math.max(1, Math.round((next - now) / H));
      toast(s, `${cad[0].toUpperCase() + cad.slice(1)} reset in ~${hrs} h — it's grindin' time`,
        `${total} tasks still to do (${left.map((r) => `${r.name}: ${r.left}`).join(", ")})`, ["reset"]);
    }
  }
  return changed;
}
