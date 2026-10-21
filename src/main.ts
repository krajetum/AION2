// Startup: load the save file, apply resets, mount the UI, then a 1 s clock for countdowns, resets and notifications.
import { mount } from "svelte";
import { RESET_CONFIG as C } from "./config.ts";
import { checkNotifications } from "./app/notifications.ts";
import { muteForAnHour } from "./app/settings.ts";
import { applyResets } from "./domain/resets.ts";
import { toast } from "./infra/notifier.ts";
import { loadData } from "./infra/storage.ts";
import { findUpdate, getAutostart, isDesktop, onTrayMute } from "./infra/system.ts";
import { act, refreshNews, save } from "./ui/actions.ts";
import App from "./ui/App.svelte";
import { showStatus } from "./ui/overlays.ts";
import { ui } from "./ui/state.svelte.ts";

const app = document.getElementById("app")!;

async function main() {
  const data = await loadData();
  ui.charId = data.characters[0].id;
  if (isDesktop()) ui.autostart = await getAutostart().catch(() => false);
  applyResets(data, Date.now(), C);
  checkNotifications(data, Date.now(), toast);
  ui.data = data;
  await save();
  app.textContent = "";
  mount(App, { target: app });

  if (isDesktop()) await onTrayMute(() => act(() => muteForAnHour(ui.data, Date.now())));

  if (isDesktop()) checkUpdate();
  refreshNews();
  let ticks = 0;
  setInterval(async () => {
    ui.now = Date.now();
    if (++ticks % 1800 === 0) refreshNews(); // every 30 min
    if (ticks % 15) return; // every 15 s: resets and notifications
    const now = Date.now();
    const reset = applyResets(ui.data, now, C).length > 0;
    if (checkNotifications(ui.data, now, toast) || reset) await save();
  }, 1000);
}

// Update from GitHub Releases; the Windows installer closes and relaunches the app itself.
async function checkUpdate() {
  try {
    const update = await findUpdate();
    if (update && confirm(`AION 2 Companion ${update.version} is available. Install it now?`)) {
      showStatus("Downloading update…");
      await update.downloadAndInstall();
    }
  } catch (e) { console.warn("Update check failed", e); }
}

main().catch((e) => { app.textContent = "Startup error: " + e; console.error(e); });
