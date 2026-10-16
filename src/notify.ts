// Toast notifications: Cloud Merchant reminder, event alerts and warnings before resets.
import { isTauri } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { EVENTS, RESET_CONFIG as C } from "./config.ts";
import { nextBoundary, nextEvent, remaining } from "./reset.ts";
import { CLOUD_MERCHANT_ID } from "./seed.ts";
import { CADENCES, type AppData, type Settings } from "./types.ts";

const H = 3600_000;

/** Notification sounds: files in public/sounds/<name>.wav (bundled into the app). Replace them with your own,
 *  same names. Each event uses <event id>.wav (see EVENTS in config.ts), else event.wav.
 *  A missing or broken file falls back to the next name, then default.wav.
 *  Each channel = one row in Settings → Notifications (on/off, volume, mute); id = settings.channels key. */
export const CHANNELS = [
  { id: "cloud", name: "Hourly Cloud Merchant reminder", sound: ["cloud"], on: true },
  ...EVENTS.map((ev) => ({ id: ev.id, name: `${ev.name}: alert 5 min before`, sound: [ev.id, "event"], on: false })),
  { id: "reset", name: "Reset warnings", sound: ["reset"], on: true },
  { id: "news", name: "News", sound: ["news"], on: true },
  { id: "check", name: "Task checked (vine boom)", sound: ["check"], on: true },
];

/** Master volume × channel volume; 0 when the master switch is off or the channel is muted. */
export const channelVolume = (s: Settings, id: string) => {
  const c = s.channels[id];
  return !s.sound || c?.muted ? 0 : s.volume * (c?.volume ?? 100) / 100;
};

export function playSound(names: string[], volume: number) {
  const [name, ...rest] = names.includes("default") ? names : [...names, "default"];
  const a = new Audio(`/sounds/${name}.wav`);
  a.volume = volume / 100;
  a.play().catch(() => { if (rest.length) playSound(rest, volume); });
}

export async function toast(s: Settings, title: string, body: string, sound: string[] = ["default"]) {
  const vol = channelVolume(s, sound[0]);
  if (vol) playSound(sound, vol);
  if (!isTauri()) return console.info(`[toast] ${title} — ${body}`); // browser preview
  let ok = await isPermissionGranted();
  if (!ok) ok = (await requestPermission()) === "granted";
  if (ok) sendNotification({ title, body });
}

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };

/** Quiet hours in the PC's local time (start > end = spans midnight). */
export function inQuietHours(s: Settings, now: number) {
  const d = new Date(now);
  const cur = d.getHours() * 60 + d.getMinutes(), a = toMin(s.quietStart), b = toMin(s.quietEnd);
  if (a === b) return false;
  return a < b ? cur >= a && cur < b : cur >= a || cur < b;
}

/** Returns true if it changed data (needs saving). */
export function checkNotifications(data: AppData, now: number): boolean {
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

  // Event alerts 5 min before start, once per start (missed while silent = skipped, it is short-lived).
  for (const ev of EVENTS) {
    const next = nextEvent(ev, now, C.timeZone);
    if (!s.channels[ev.id]?.on || data.warnedEvent[ev.id] === next || next - now > 5 * 60_000) continue;
    data.warnedEvent[ev.id] = next;
    changed = true;
    if (!silent) toast(s, ev.name, `Starts in ${Math.max(1, Math.round((next - now) / 60_000))} min.`, [ev.id, "event"]);
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
