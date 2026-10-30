// The Fight Log's file (plugin-store → fights.json next to data.json): kept apart from the save file, which is also the
// export format and would grow by hundreds of KB. Outside Tauri it falls back to localStorage, like storage.ts.
import { isTauri } from "@tauri-apps/api/core";
import { load, type Store } from "@tauri-apps/plugin-store";
import type { FightRecord } from "../domain/fights.ts";

const LS_KEY = "aion2-companion-fights";
let store: Store | undefined;

export async function loadFights(): Promise<FightRecord[]> {
  let raw: unknown;
  if (isTauri()) {
    store = await load("fights.json", { autoSave: false, defaults: {} });
    raw = await store.get("fights");
  } else {
    const s = localStorage.getItem(LS_KEY);
    raw = s && JSON.parse(s);
  }
  return Array.isArray(raw) ? raw : [];
}

export async function saveFights(fights: FightRecord[]) {
  if (!store) return localStorage.setItem(LS_KEY, JSON.stringify(fights));
  await store.set("fights", fights);
  await store.save();
}
