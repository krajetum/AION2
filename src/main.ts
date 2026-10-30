// Startup: load the save file, apply resets, mount the UI, then a 1 s clock for countdowns, resets and notifications.
import { mount } from "svelte";
import type { Fight, MeterUpdate } from "./domain/meter.ts";
import { addFight, fightEnded, toRecord } from "./domain/fights.ts";
import { charFor, eventsFrom, SUGGEST_MS, type MeterEvent } from "./domain/triggers.ts";
import { autoTick } from "./app/auto.ts";
import { RESET_CONFIG as C } from "./config.ts";
import { checkNotifications } from "./app/notifications.ts";
import { muteForAnHour } from "./app/settings.ts";
import { applyResets } from "./domain/resets.ts";
import { BUNDLED_DROPS, takeBundledDrops } from "./domain/map.ts";
import petDropsUrl from "./assets/pet-drops.json?url";
import { toast } from "./infra/notifier.ts";
import { loadData } from "./infra/storage.ts";
import { loadFights, saveFights } from "./infra/fights.ts";
import { findUpdate, getAutostart, isDesktop, onTrayMute, openLinksInBrowser } from "./infra/system.ts";
import { act, refreshNews, save } from "./ui/actions.ts";
import App from "./ui/App.svelte";
import Overlay from "./ui/Overlay.svelte";
import EventsOverlay from "./ui/EventsOverlay.svelte";
import CubeOverlay from "./ui/CubeOverlay.svelte";
import RadarOverlay from "./ui/RadarOverlay.svelte";
import { takeMeterData } from "./app/arena.ts";
import { bossEvery, flushCubes, gameActive, shareFromMeter, syncBosses, syncCubes } from "./app/crowd.ts";
import { cubePopup, eventsOverlay, meterCubeCodes, meterIdle, radarOverlay, meterOverlay, onEventsOverlay, onMeter, onOpacity, onOverlay, overlayStyle } from "./infra/meter.ts";
import { showStatus } from "./ui/overlays.ts";
import { fightsSnapshot, ui } from "./ui/state.svelte.ts";

const app = document.getElementById("app")!;

async function main() {
  const data = await loadData();
  ui.charId = data.characters[0].id;
  if (isDesktop()) ui.autostart = await getAutostart().catch(() => false);
  if (isDesktop()) openLinksInBrowser();
  // The pet drops shared with the app (src/assets/pet-drops.json), once per bundle: a separate file, fetched only then.
  if (data.map.bundledDrops !== BUNDLED_DROPS)
    await fetch(petDropsUrl).then((r) => r.json()).then((f) => takeBundledDrops(data.map, f)).catch((e) => console.warn("Bundled pet drops not loaded", e));
  applyResets(data, Date.now(), C);
  checkNotifications(data, Date.now(), toast);
  ui.data = data;
  ui.fights = await loadFights().catch((e) => { console.warn("Fight Log not loaded", e); return []; });
  await save();
  app.textContent = "";
  mount(App, { target: app });

  if (isDesktop()) {
    await onOverlay((on) => { ui.overlay = on; });
    await meterIdle(data.settings.dpsIdleSeconds).catch(() => {});
    await overlayStyle(data.settings.overlayFollowGame, data.settings.overlayOpacity).catch(() => {});
    // Overlay on: it shows at the first fight (hidden until then).
    if (data.settings.dpsOverlay) await meterOverlay(true, false).catch(() => {});
    // The event overlay saves its switch here, also when closed from its own X.
    await onEventsOverlay((on) => { if (ui.data.settings.eventsOverlay !== on) act(() => { ui.data.settings.eventsOverlay = on; }); });
    if (data.settings.eventsOverlay) await eventsOverlay(true).catch(() => {});
    await meterCubeCodes(data.map.cubeCodes).catch(() => {});
    if (data.settings.cubePopup) await cubePopup(true, data.settings.cubePopupSize).catch(() => {});
    if (data.settings.radar) await radarOverlay(true).catch(() => {});
  }
  // The capture runs from app start: boss timers, Odyle energy, who you play and the arena log need it.
  // Only the latest update is taken: each carries the meter's whole state (kills, gains, loots, position...), and
  // a page slower than the meter's 5 updates a second (the Map with its ~1,400 spots) otherwise fell behind for
  // good: the map still moved minutes after the game was closed (2026-10-28).
  let pending: MeterUpdate | null = null;
  let last: MeterUpdate | undefined; // the previous update: a fight that ended (Fight Log), events for auto-tracked tasks
  onMeter((u) => {
    const first = !pending;
    pending = u;
    if (!first) return;
    setTimeout(() => {
      const latest = pending!;
      pending = null;
      ui.meter = latest;
      const lastFight: Fight | undefined = last?.fight;
      if (fightEnded(lastFight, latest.fight)) {
        ui.fights = addFight(ui.fights, toRecord(lastFight, latest.profile, latest.position?.mapId ?? null, Date.now()));
        saveFights(fightsSnapshot()).catch((e) => console.warn("Fight Log not saved", e));
      }
      autoTrack(eventsFrom(last, latest, Date.now()), latest);
      last = latest;
      const shared = shareFromMeter(ui.data, latest); // before takeMeterData: it compares with the saved data
      if (takeMeterData(ui.data, latest) || shared) save();
    });
  });
  if (isDesktop()) await onTrayMute(() => act(() => muteForAnHour(ui.data, Date.now())));

  if (isDesktop()) checkUpdate();
  refreshNews();
  crowdBosses();
  crowdCubes();
  let ticks = 0;
  setInterval(async () => {
    ui.now = Date.now();
    if (++ticks % 1800 === 0) refreshNews(); // every 30 min
    if (ticks % 21600 === 0 && isDesktop()) checkUpdate(); // every 6 h: the app can stay in the tray for days
    // Other players' boss timers every 2 min and cube spots every hour, only while you play.
    if (ticks % bossEvery === 0 && gameActive(ui.now)) crowdBosses();
    if (ticks % 3600 === 0 && gameActive(ui.now)) crowdCubes();
    if (ticks % 600 === 0) flushCubes(ui.data);
    if (ticks % 15) return; // every 15 s: resets and notifications
    const now = Date.now();
    const reset = applyResets(ui.data, now, C).length > 0;
    if (checkNotifications(ui.data, now, toast) || reset) await save();
  }, 1000);
}

// Auto-tracked tasks: the events tick the played character's tasks; they stay a few minutes as trigger suggestions.
const entered = new Map<string, number>(); // task id → the map entry that last ticked it
function autoTrack(evs: MeterEvent[], u: MeterUpdate) {
  if (!evs.length) return;
  const now = Date.now();
  ui.recent = [...ui.recent, ...evs].filter((e) => now - e.atMs <= SUGGEST_MS);
  const char = charFor(ui.data.characters, u.profile?.name);
  const ticked = char ? evs.flatMap((ev) => autoTick(ui.data, char.id, ev, entered)) : [];
  if (!char || !ticked.length) return;
  save();
  const s = ui.data.settings, mine = char.id === ui.charId, names = [...new Set(ticked.map((t) => t.name))].join(" · ");
  if (s.channels.auto?.on && !(s.mutedUntil > now)) toast(s, mine ? "Ticked by the game" : `Ticked by the game: ${char.name}`, names, ["auto", "check"]);
  showStatus(`Ticked by the game: ${names}${mine ? " (Ctrl+Z to undo)" : ` (${char.name})`}`);
}

async function crowdBosses() {
  if (await syncBosses(ui.data)) await save();
}

async function crowdCubes() {
  const { changed, codes } = await syncCubes(ui.data);
  if (codes && isDesktop()) await meterCubeCodes(ui.data.map.cubeCodes).catch(() => {});
  if (changed) await save();
}

// Update from GitHub Releases: a banner (App.svelte) offers it, the player installs it; the Windows installer closes and relaunches the app itself.
async function checkUpdate() {
  try {
    const update = await findUpdate();
    if (update && update.version !== ui.update?.version) ui.update = { version: update.version, install: () => update.downloadAndInstall() };
  } catch (e) { console.warn("Update check failed", e); }
}

// The overlay windows load this page too (index.html#overlay = DPS, #events = event countdowns): they show
// only that, without the save file, resets or notifications, which stay with the main window.
function overlay(page: typeof Overlay) {
  document.documentElement.classList.add("overlay");
  document.body.classList.add("overlay");
  app.textContent = "";
  mount(page, { target: app });
  // Background opacity from Settings (the window itself is transparent).
  onOpacity((o) => document.documentElement.style.setProperty("--ov-alpha", `${o}%`));
}

const page = { "#overlay": Overlay, "#events": EventsOverlay, "#cube": CubeOverlay, "#radar": RadarOverlay }[location.hash];
(page ? Promise.resolve(overlay(page)) : main()).catch((e) => { app.textContent = "Startup error: " + e; console.error(e); });
