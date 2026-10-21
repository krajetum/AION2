// Desktop integration: autostart, updates from GitHub Releases, the tray "Mute for 1 hour" event (src-tauri/src/lib.rs).
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { check } from "@tauri-apps/plugin-updater";

export const isDesktop = isTauri;

export const getAutostart = () => isEnabled();

/** Returns the state actually set. */
export async function setAutostart(on: boolean) {
  await (on ? enable() : disable());
  return isEnabled();
}

/** The Windows installer closes and relaunches the app itself. */
export const findUpdate = () => check();

export const onTrayMute = (handler: () => void) => listen("tray-mute", handler);
