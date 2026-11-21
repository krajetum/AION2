// Glue between UI events and the app/ use cases: save after each change, undo, progress tracking, news refresh.
import { fetchCodes } from "../app/codes.ts";
import { reminderText, shouldRemind, toRedeem } from "../domain/codes.ts";
import { syncGuild } from "../app/guild.ts";
import { flushGathers, syncGathers } from "../app/crowd.ts";
import { trackProgress } from "../app/progress.ts";
import { findTask } from "../app/tasks.ts";
import { RIFT_MS, type Cue } from "../domain/mascot.ts";
import { leftShare } from "../domain/planner.ts";
import { allDone } from "../domain/tasks.ts";
import { suggest } from "../domain/triggers.ts";
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

/** The mascot's cue (domain/mascot.ts): it cheers or sulks for a few seconds. */
export function cue(kind: Cue["kind"]) {
  const now = Date.now();
  ui.mascotCues = [...ui.mascotCues.filter((c) => now - c.atMs < RIFT_MS), { kind, atMs: now }];
}

/** A small win (a list finished, a personal best): confetti, the mascot cheers, the status line says why.
 *  Only the line with `settings.celebrate` off. */
export function celebrate(text: string) {
  showStatus(text);
  if (!ui.data.settings.celebrate) return;
  ui.party = Date.now();
  cue("cheer");
}

/** A progress change of the current character (undoable, timed during a Planner session). */
export function track(id: string, change: () => void) {
  const t = findTask(ui.data, id), before = leftShare(t, ui.data.progress[ui.charId]?.[id]);
  const wasAll = allDone(ui.data, ui.charId, t.cadence);
  const after = trackProgress(ui.data, ui.charId, id, Date.now(), change);
  if (!wasAll && allDone(ui.data, ui.charId, t.cadence)) celebrate(`Every ${t.cadence} task is done.`);
  if (ui.tab === "plan" && !after) doneHere.add(id);
  // Ticked by hand just after something in game: offer it as the task's trigger (src/domain/triggers.ts).
  const offer = after < before ? suggest(ui.recent, t, Date.now()).slice(0, 3) : [];
  if (offer.length) ui.suggest = { taskId: id, triggers: offer };
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

/** The shared redeem codes into ui.codes (startup, every 30 min, Home, entering the game). */
/** Other players' gathering spots (the Worker), at most once a minute: the Map's Gathering layer asks when it opens.
 *  `force` (its Refresh button): yours still queued are sent first, then the others' read now. False = not read. */
let gathersAt = 0;
export async function refreshGathers(force = false): Promise<boolean> {
  if (!force && Date.now() - gathersAt < 60_000) return true;
  gathersAt = Date.now();
  const sent = force && await flushGathers(ui.data);
  const ok = await syncGathers(ui.data);
  if (ok) ui.gathersAt = Date.now();
  if (ok || sent) await save();
  return ok;
}

export async function refreshCodes() {
  try {
    ui.codes = await fetchCodes();
    ui.codesError = "";
  } catch (e) { ui.codesError = "Offline: " + (e as Error).message; console.warn("Codes not read", e); }
}

/** Entering the game or another character: a reminder of the codes still to redeem, and that the rewards land on `char`. */
let remindedFor: string | null = null;
export async function remindCodes(char: string | undefined) {
  if (!shouldRemind(char, remindedFor)) return;
  remindedFor = char!;
  const s = ui.data.settings;
  if (!s.channels.codes?.on || s.mutedUntil > Date.now()) return;
  await refreshCodes();
  const left = toRedeem(ui.codes, ui.data.codes, Date.now());
  if (!left.length) return;
  const { title, body } = reminderText(left, char!);
  toast(s, title, body, ["codes", "news"]);
  showStatus(`${title}. ${body}`);
}

/** The guild's members and settings into ui.guild (main.ts while playing, the Guild page when opened).
 *  An install an officer removed leaves the guild here too. */
export async function refreshGuild(playing: boolean) {
  const { view, removed } = await syncGuild(ui.data, ui.meter?.profile, playing);
  if (view) ui.guild = view;
  if (removed) {
    ui.guild = null;
    await save();
    showStatus("You are no longer in your static: an officer removed you or the static was deleted.");
  }
}

/** News link or banner dismiss: marks it read after the click, so a link isn't removed mid-click and still opens. */
export const markRead = (gid: string) => setTimeout(() => act(() => markNewsRead(ui.data, gid)));
