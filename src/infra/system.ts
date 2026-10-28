// Desktop integration: autostart, updates from GitHub Releases, the tray "Mute for 1 hour" event (src-tauri/src/lib.rs).
import { invoke, isTauri } from "@tauri-apps/api/core";
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

/**
 * Web links open in the player's browser: the webview opens no window for `target="_blank"`, so in the desktop app
 * they did nothing (the shugo.gg profile link, 2026-10-28). Every http(s) link of the page, current and future.
 */
export function openLinksInBrowser() {
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || !/^https?:/.test(a.href) || e.defaultPrevented) return;
    e.preventDefault();
    invoke("open_url", { url: a.href }).catch((err) => console.warn("Could not open the link", err));
  });
}
