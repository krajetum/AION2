// Persistence (plugin-store → data.json in the app data folder) + JSON backup.
// Outside Tauri (plain browser on `npm run dev`) it falls back to localStorage,
// so the UI can be previewed and tested in a normal browser.
import { isTauri } from "@tauri-apps/api/core";
import { load, type Store } from "@tauri-apps/plugin-store";
import { defaultData, normalize } from "../domain/save-file.ts";
import type { AppData } from "../domain/types.ts";

const LS_KEY = "aion2-companion-data";
let store: Store | undefined;

export async function loadData(): Promise<AppData> {
  let raw: unknown;
  if (isTauri()) {
    store = await load("data.json", { autoSave: false, defaults: {} });
    raw = await store.get<AppData>("data");
  } else {
    const s = localStorage.getItem(LS_KEY);
    raw = s && JSON.parse(s);
  }
  return raw ? normalize(raw) : defaultData();
}

export async function saveData(data: AppData) {
  if (!store) return localStorage.setItem(LS_KEY, JSON.stringify(data));
  await store.set("data", data);
  await store.save();
}

/** Saves `value` as a JSON file (the webview's download: the Downloads folder). */
export function downloadJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const exportJson = (data: AppData) => downloadJson(`aion2-companion-backup-${new Date().toISOString().slice(0, 10)}.json`, data);

export async function importJson(file: File): Promise<AppData> {
  return normalize(JSON.parse(await file.text()));
}
