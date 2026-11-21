// The Fight Log's file (plugin-store → fights.json next to data.json, compact JSON): kept apart from the save file,
// which is also the export format and would grow by hundreds of KB. Outside Tauri it falls back to localStorage, like storage.ts.
import { isTauri } from "@tauri-apps/api/core";
import { load, type Store } from "@tauri-apps/plugin-store";
import { FIGHTS_FORMAT, packFight, unpackFight, type FightRecord } from "../domain/fights.ts";

const LS_KEY = "aion2-companion-fights";
let store: Store | undefined;

export async function loadFights(): Promise<FightRecord[]> {
  let raw: unknown, format: unknown;
  if (isTauri()) {
    store = await load("fights.json", { autoSave: false, defaults: {}, serializeFnName: "compact" });
    [raw, format] = await Promise.all([store.get("fights"), store.get("format")]);
  } else {
    const s = localStorage.getItem(LS_KEY);
    const v = s && JSON.parse(s);
    [raw, format] = Array.isArray(v) ? [v, undefined] : [v?.fights, v?.format];
  }
  if (!Array.isArray(raw)) return [];
  return format === FIGHTS_FORMAT ? raw.map(unpackFight) : raw;
}

export async function saveFights(fights: FightRecord[]) {
  const packed = fights.map(packFight);
  if (!store) return localStorage.setItem(LS_KEY, JSON.stringify({ format: FIGHTS_FORMAT, fights: packed }));
  await store.set("fights", packed);
  await store.set("format", FIGHTS_FORMAT);
  await store.save();
}
