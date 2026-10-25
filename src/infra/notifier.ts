// Toast notifications + sounds (Tauri notification plugin; console in the browser preview).
import { isTauri } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { channelVolume } from "../domain/alerts.ts";
import type { Settings } from "../domain/types.ts";

export function playSound(names: string[], volume: number) {
  const [name, ...rest] = names.includes("default") ? names : [...names, "default"];
  const a = new Audio(`/sounds/${name}.wav`);
  a.volume = volume / 100;
  a.play().catch(() => { if (rest.length) playSound(rest, volume); });
}

/** Hopex's birthday song; never below 5 %, whatever the save file says. */
export function playBirthday(volume: number) {
  const a = new Audio("/sounds/happy-birthday.mp3");
  a.volume = Math.max(5, Math.min(100, volume || 5)) / 100;
  a.play().catch(() => {});
}

export async function toast(s: Settings, title: string, body: string, sound: string[] = ["default"]) {
  const vol = channelVolume(s, sound[0]);
  if (vol) playSound(sound, vol);
  if (!isTauri()) return console.info(`[toast] ${title} — ${body}`); // browser preview
  let ok = await isPermissionGranted();
  if (!ok) ok = (await requestPermission()) === "granted";
  if (ok) sendNotification({ title, body });
}
