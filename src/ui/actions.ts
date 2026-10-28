// Glue between UI events and the app/ use cases: save after each change, undo, progress tracking, news refresh.
import { trackProgress } from "../app/progress.ts";
import { markNewsRead } from "../app/settings.ts";
import { mergeNews } from "../domain/news.ts";
import { popUndo } from "../domain/undo.ts";
import { toast } from "../infra/notifier.ts";
import { fetchNews } from "../infra/steam.ts";
import { saveData } from "../infra/storage.ts";
import { showStatus } from "./overlays.ts";
import { doneHere, snapshot, ui } from "./state.svelte.ts";

// One save at a time: changes made while one runs are saved once after it, not once each (a save writes the
// whole file, ~1 MB with the map's spots).
let saving: Promise<void> | null = null, again = false;
export function save(): Promise<void> {
  if (saving) { again = true; return saving; }
  saving = (async () => {
    do {
      again = false;
      await saveData(snapshot()).catch((e) => console.error("Save failed", e));
    } while (again);
    saving = null;
  })();
  return saving;
}

/** Runs a change, then saves. A change returning false changed nothing: no save. */
export async function act(change: () => unknown) {
  if ((await change()) === false) return;
  await save();
}

/** Text / number / select field: applies its value, puts the stored value back in the field
 *  (a clamped, trimmed or rejected entry snaps back) and saves. */
export function commit(e: Event, change: (v: string) => void, stored: () => unknown) {
  const el = e.currentTarget as HTMLInputElement | HTMLSelectElement;
  change(el.value);
  el.value = String(stored() ?? "");
  return save();
}

/** A progress change of the current character (undoable, timed during a Planner session). */
export function track(id: string, change: () => void) {
  const after = trackProgress(ui.data, ui.charId, id, Date.now(), change);
  if (ui.tab === "plan" && !after) doneHere.add(id);
}

export async function undo() {
  const label = popUndo(ui.data, ui.charId);
  if (!label) return;
  showStatus(`Undone: ${label}`);
  await save();
}

/** Fetches news, toasts new posts. Network errors keep the cached list. */
export async function refreshNews() {
  try {
    const fresh = mergeNews(ui.data, await fetchNews());
    ui.newsError = "";
    const s = ui.data.settings;
    if (fresh.length && s.channels.news?.on && !(s.mutedUntil > Date.now()))
      toast(s, fresh.length === 1 ? "AION 2 news" : `${fresh.length} AION 2 news`, fresh.map((n) => n.title).join(" · "), ["news"]);
    await save();
  } catch (e) { ui.newsError = "Offline: " + (e as Error).message; console.warn(e); }
}

/** News link or banner dismiss: marks it read after the click, so a link isn't removed mid-click and still opens. */
export const markRead = (gid: string) => setTimeout(() => act(() => markNewsRead(ui.data, gid)));
