import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { check } from "@tauri-apps/plugin-updater";
import { EVENTS, RESET_CONFIG as C } from "./config.ts";
import { exportJson, importJson, loadData, saveData } from "./data.ts";
import { fetchNews, isImportant, mergeNews } from "./news.ts";
import { channelVolume, CHANNELS, checkNotifications, playSound, toast } from "./notify.ts";
import { applyResets, formatCountdown, isDone, lastBoundary, nextBoundary, nextEvent } from "./reset.ts";
import { CADENCES, type AppData, type Cadence, type Goal, type Task } from "./types.ts";

type Tab = Cadence | "news" | "settings";
const LABEL: Record<Cadence, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

let data: AppData;
let charId = "";
let tab: Tab = "daily";
let editing = false;
let autostart = false;
let newsError = "";
const openNews = new Set<string>(); // expanded news gids, kept across re-renders
// Live region outside #app so renders never wipe it; announces politely and fades after 5 s.
const statusEl = document.body.appendChild(Object.assign(document.createElement("p"), { className: "status", role: "status" }));
let statusTimer = 0;
function showStatus(msg: string, err = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("err", err);
  statusEl.classList.add("on");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.classList.remove("on"), 5000);
}
const app = document.getElementById("app")!;

// Memes: files in src/memes/<kind>/, one picked per launch so re-renders don't swap them.
const pick = (files: Record<string, string>) => { const l = Object.values(files); return l[Math.floor(Math.random() * l.length)]; };
const MEME = {
  win: pick(import.meta.glob<string>("./memes/win/*.{gif,webp,png,jpg}", { eager: true, query: "?url", import: "default" })),
  empty: pick(import.meta.glob<string>("./memes/empty/*.{gif,webp,png,jpg}", { eager: true, query: "?url", import: "default" })),
  mascot: pick(import.meta.glob<string>("./memes/mascot/*.{gif,webp,png,jpg}", { eager: true, query: "?url", import: "default" })),
};
// Reaction on check: a fresh random pick every time, overlay outside #app like statusEl.
const REACT = Object.values(import.meta.glob<string>("./memes/react/*.{gif,webp,png,jpg}", { eager: true, query: "?url", import: "default" }));
const reactEl = document.body.appendChild(Object.assign(document.createElement("img"), { className: "react", alt: "" }));
let reactTimer = 0;
function react() {
  const vol = channelVolume(data.settings, "check");
  if (vol) playSound(["check"], vol);
  if (!REACT.length) return;
  reactEl.src = REACT[Math.floor(Math.random() * REACT.length)];
  reactEl.classList.remove("on");
  void reactEl.offsetWidth; // restart the animation on quick double checks
  reactEl.classList.add("on");
  clearTimeout(reactTimer);
  reactTimer = setTimeout(() => reactEl.classList.remove("on"), 1500);
}
const meme = (src: string | undefined, cls: string) => src ? `<img class="meme ${cls}" src="${src}" alt="">` : "";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const save = () => saveData(data).catch((e) => console.error("Save failed", e));

// "Wins:30, Entries:10" | "2000" | "Level:50/5"
function parseGoals(s: string): Goal[] | undefined {
  const goals = s.split(",").map((x) => x.trim()).filter(Boolean).map((part) => {
    const m = part.match(/^(?:(.+?)\s*:\s*)?(\d+)(?:\s*\/\s*(\d+))?$/);
    if (!m) throw new Error(`Invalid goal: "${part}"`);
    return { label: m[1] || undefined, target: +m[2], step: m[3] ? +m[3] : undefined };
  });
  return goals.length ? goals : undefined;
}
const formatGoals = (g?: Goal[]) =>
  (g ?? []).map((x) => `${x.label ? x.label + ":" : ""}${x.target}${x.step ? "/" + x.step : ""}`).join(", ");

const sorted = (cad: Cadence) => data.tasks.filter((t) => t.cadence === cad).sort((a, b) => a.order - b.order);
const prog = (taskId: string) => ((data.progress[charId] ??= {})[taskId] ??= { done: false });

// ---------- render ----------
function render() {
  const chars = data.characters.map((c) => `<option value="${c.id}" ${c.id === charId ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  const unread = data.news.filter((n) => !n.read).length;
  const tabName = (t: Tab) => {
    if (t === "settings") return "Settings";
    if (t === "news") return `News${unread ? ` <span class="badge">${unread}</span>` : ""}`;
    const tasks = data.tasks.filter((x) => x.enabled && x.cadence === t);
    const done = tasks.filter((x) => isDone(x, data.progress[charId]?.[x.id])).length;
    return `${LABEL[t]} <span class="count">${done}/${tasks.length}</span>`;
  };
  const tabs = [...CADENCES, "news" as const, "settings" as const].map((t) =>
    `<button class="tab" role="tab" aria-selected="${t === tab}" data-tab="${t}">${tabName(t)}</button>`).join("");
  const banner = data.news.filter((n) => !n.read && isImportant(n)).map((n) =>
    `<div class="banner"><a href="${esc(n.url)}" target="_blank" rel="noopener" data-act="read" data-id="${esc(n.gid)}">${esc(n.title)}</a>
      <button class="ghost" data-act="read" data-id="${esc(n.gid)}" aria-label="Dismiss" title="Dismiss">✕</button></div>`).join("");
  const muted = data.settings.mutedUntil > Date.now()
    ? `<span class="chip">Shhh until ${new Date(data.settings.mutedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        <button data-act="unmute">Unshhh</button></span>` : "";
  app.innerHTML = `
    <header>
      ${data.settings.memeMascot && MEME.mascot ? `<button class="mascot" data-act="hide-mascot" aria-label="Hide mascot" title="Click to hide">${meme(MEME.mascot, "")}</button>` : ""}
      <h1 class="brand"><b>AION 2</b><span>Companion™ <small>no bots, I swear</small></span></h1>
      ${muted}
      <label class="char">Character <select id="char">${chars}</select></label>
    </header>
    <div class="timers">
      ${CADENCES.map((c) => `<div class="timer"><small>${LABEL[c]} copium refill</small><span data-cd="${c}"></span></div>`).join("")}
      ${EVENTS.map((ev) => `<div class="timer event"><small>${esc(ev.name)}</small><span data-ev="${ev.id}"></span></div>`).join("")}
    </div>
    ${banner}
    <nav role="tablist">${tabs}</nav>
    <main>
      ${tab === "settings" ? settingsView() : tab === "news" ? newsView() : listView(tab)}</main>`;
  updateCountdowns();
}

function listView(cad: Cadence) {
  const tasks = sorted(cad).filter((t) => editing || t.enabled);
  const cats = [...new Set(tasks.map((t) => t.category))];
  const groups = cats.map((cat) => {
    const list = tasks.filter((t) => t.category === cat);
    const done = list.filter((t) => isDone(t, data.progress[charId]?.[t.id])).length;
    return `<section><h2>${esc(cat)}${editing ? "" : ` <span class="count">${done}/${list.length}</span>`}</h2>
      ${list.map((t) => editing ? editRow(t) : taskRow(t)).join("")}
    </section>`;
  }).join("");
  const add = editing ? `
    <section class="add"><h2>New ${LABEL[cad].toLowerCase()} task</h2>
      <div class="row">
        <input id="new-cat" placeholder="Category…" list="cats" aria-label="Category" autocomplete="off">
        <datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
        <input id="new-name" placeholder="Name…" aria-label="Name" autocomplete="off">
        <input id="new-goals" placeholder="Goals, e.g. Wins:30, Entries:10…" aria-label="Goals" autocomplete="off">
        <button class="primary" data-act="add">Yeet it in</button>
      </div>
    </section>` : "";
  const all = sorted(cad).filter((t) => t.enabled);
  const win = !editing && all.length && all.every((t) => isDone(t, data.progress[charId]?.[t.id]))
    ? `<section class="win">${meme(MEME.win, "")}<div><h2>GG EZ — all ${LABEL[cad].toLowerCase()} tasks done</h2><p>Go touch grass. The reset will find you.</p></div></section>` : "";
  const empty = `<p class="empty">${meme(MEME.empty, "")}It's empty. Like my Kina wallet. Click <b>Edit tasks</b> to add one.</p>`;
  return `<div class="toolbar"><button class="${editing ? "primary" : ""}" data-act="edit">${editing ? "Done (trust me bro)" : "Edit tasks (big brain)"}</button></div>${win}${groups || empty}${add}`;
}

function taskRow(t: Task) {
  const p = data.progress[charId]?.[t.id];
  const goals = (t.goals ?? []).map((g, i) => {
    const v = p?.counts?.[i] ?? 0;
    const name = esc(g.label ?? t.name);
    return `<div class="goal ${v >= g.target ? "ok" : ""}">
      <div class="stepper">${g.label ? `<span class="of">${esc(g.label)}</span>` : ""}
        <button data-act="dec" data-id="${t.id}" data-i="${i}" aria-label="Decrease ${name}">−</button>
        <input type="number" min="0" max="${g.target}" step="${g.step ?? 1}" value="${v}" data-act="set" data-id="${t.id}" data-i="${i}" aria-label="${name}">
        <span class="of">/ ${g.target}</span>
        <button data-act="inc" data-id="${t.id}" data-i="${i}" aria-label="Increase ${name}">+</button></div>
      <div class="bar"><i style="--p:${Math.min(1, v / g.target)}"></i></div></div>`;
  }).join("");
  return `<div class="task ${isDone(t, p) ? "done" : ""}">
    <label><input type="checkbox" data-act="toggle" data-id="${t.id}" ${p?.done ? "checked" : ""}>
      <span class="text"><span class="name">${esc(t.name)}</span>${t.note ? `<small>${esc(t.note)}</small>` : ""}</span></label>
    ${goals ? `<div class="goals">${goals}</div>` : ""}</div>`;
}

function editRow(t: Task) {
  return `<div class="task edit ${t.enabled ? "" : "off"}">
    <span class="move"><button data-act="up" data-id="${t.id}" aria-label="Move up" title="Move up">▲</button><button data-act="down" data-id="${t.id}" aria-label="Move down" title="Move down">▼</button></span>
    <input value="${esc(t.category)}" data-act="cat" data-id="${t.id}" aria-label="Category" title="Category">
    <input value="${esc(t.name)}" data-act="name" data-id="${t.id}" aria-label="Name" title="Name">
    <input value="${esc(formatGoals(t.goals))}" data-act="goals" data-id="${t.id}" placeholder="Goals…" aria-label="Goals" title="E.g. 2000 · Wins:30, Entries:10 · Level:50/5">
    <input value="${esc(t.note ?? "")}" data-act="note" data-id="${t.id}" placeholder="Note…" aria-label="Note">
    <label class="switch"><input type="checkbox" data-act="enabled" data-id="${t.id}" ${t.enabled ? "checked" : ""} aria-label="Enabled"></label></div>`;
}

function newsView() {
  const items = data.news.map((n) => `
    <article class="news-item ${n.read ? "" : "unread"}">
      <a href="${esc(n.url)}" target="_blank" rel="noopener" data-act="read" data-id="${esc(n.gid)}">${isImportant(n) ? "⚠ " : ""}${esc(n.title)}</a>
      <small>${new Date(n.date * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</small>
      <p>${esc(n.contents)}</p>
      ${n.contents.length > 220 || n.contents.split("\n").length > 3 ? `<details data-id="${esc(n.gid)}" ${openNews.has(n.gid) ? "open" : ""}>
        <summary><span>Show more</span><span>Show less</span></summary></details>` : ""}</article>`).join("");
  return `<div class="toolbar">${newsError ? `<span class="note">${esc(newsError)}</span>` : ""}
      <button class="ghost" data-act="read-all">Pretend I read them</button><button data-act="refresh-news">F5</button></div>
    <section><h2>Official announcements <span class="count">Steam</span></h2>${items || `<p class="empty">${meme(MEME.empty, "")}No news. Devs are cooking. 🍳</p>`}</section>`;
}

function settingsView() {
  const s = data.settings;
  const pad = (n: number) => String(n).padStart(2, "0");
  const toggle = (attrs: string, label: string) =>
    `<label class="setting switch"><span>${label}</span><input type="checkbox" ${attrs}></label>`;
  return `<div class="settings"><div>
    <section><h2>Characters</h2>
      ${data.characters.map((c) => `<div class="setting"><input value="${esc(c.name)}" data-act="rename-char" data-id="${c.id}" aria-label="Character name" autocomplete="off">${data.characters.length > 1 ? `<button data-act="del-char" data-id="${c.id}">Delete</button>` : ""}</div>`).join("")}
      <div class="setting"><input id="new-char" placeholder="New character name…" aria-label="New character name" autocomplete="off"><button data-act="add-char">Add</button></div>
    </section>
    <section><h2>Reset warnings</h2>
      ${CADENCES.map((c) => `<label class="setting"><span>${LABEL[c]} reset</span>
        <span class="ctl"><input type="number" min="0" max="168" value="${s.warnHours[c]}" data-act="warn" data-cad="${c}"> h before</span></label>`).join("")}
    </section>
    <section><h2>System</h2>
      ${toggle(`data-act="autostart" ${autostart ? "checked" : ""} ${isTauri() ? "" : "disabled"}`, "Start with Windows")}
      ${toggle(`data-act="meme-mascot" ${data.settings.memeMascot ? "checked" : ""}`, "Meme mascot")}
      <div class="btns"><button data-act="export">Export JSON</button>
        <label class="btn">Import JSON <input type="file" accept=".json,application/json" data-act="import" hidden></label></div>
    </section>
  </div><div>
    <section><h2>Notifications</h2>
      ${toggle(`data-act="sound" ${s.sound ? "checked" : ""}`, "Sound")}
      <label class="setting"><span>Master volume</span><input type="range" min="0" max="100" value="${s.volume}" data-act="volume"></label>
      ${CHANNELS.map((c) => { const ch = s.channels[c.id], name = esc(c.name); return `<div class="setting chan">
        ${c.id === "check" ? `<span>${name}</span>` : `<label class="switch"><input type="checkbox" data-act="ch-on" data-id="${c.id}" ${ch.on ? "checked" : ""}><span>${name}</span></label>`}
        <span class="ctl"><input type="range" min="0" max="100" value="${ch.volume}" data-act="ch-vol" data-id="${c.id}" aria-label="${name} volume" ${ch.muted ? "disabled" : ""}>
          <button class="ghost" data-act="ch-mute" data-id="${c.id}" aria-pressed="${ch.muted}" aria-label="Mute ${name} sound" title="${ch.muted ? "Unmute" : "Mute"} sound">${ch.muted ? "🔇" : "🔊"}</button>
          <button class="ghost" data-act="test-sound" data-kind="${c.sound}" data-id="${c.id}" aria-label="Play ${name} sound" title="sounds/${c.sound[0]}.wav">▶</button></span></div>`; }).join("")}
      <div class="setting"><span>Quiet hours</span><span class="ctl">
        <input type="time" value="${s.quietStart}" data-act="quiet-start" aria-label="Quiet hours start"> to
        <input type="time" value="${s.quietEnd}" data-act="quiet-end" aria-label="Quiet hours end"></span></div>
      <div class="btns"><button data-act="mute">Shhh (1 h)</button><button class="ghost" data-act="unmute">Unshhh</button><button class="ghost" data-act="test">Test notification</button></div>
    </section>
    <section><h2>Reset times <span class="count">TO VERIFY</span></h2>
      <dl>
        <dt>Time zone</dt><dd>${C.timeZone}</dd>
        <dt>Daily</dt><dd>${pad(C.daily.hour)}:${pad(C.daily.minute)}</dd>
        <dt>Weekly</dt><dd>${WEEKDAYS[C.weekly.weekday]} ${pad(C.weekly.hour)}:${pad(C.weekly.minute)}</dd>
        <dt>Monthly</dt><dd>Day ${C.monthly.day} at ${pad(C.monthly.hour)}:${pad(C.monthly.minute)}</dd>
        <dt>Cloud Merchant</dt><dd>Minute ${C.cloudMerchantMinute} of every hour</dd>
        ${EVENTS.map((ev) => `<dt>${esc(ev.name)}</dt><dd>Every ${ev.everyHours} h at :${pad(ev.minute)}${ev.everyHours > 1 ? ` from ${pad(ev.firstHour)}:00` : ""}</dd>`).join("")}
      </dl>
      <p class="hint">Edit in src/config.ts</p>
    </section>
  </div></div>`;
}

function updateCountdowns() {
  const now = Date.now();
  for (const c of CADENCES) {
    const el = app.querySelector<HTMLElement>(`[data-cd="${c}"]`);
    if (!el) continue;
    const next = nextBoundary(c, now, C), last = lastBoundary(c, now, C);
    el.textContent = formatCountdown(next - now);
    el.parentElement!.style.setProperty("--p", String((now - last) / (next - last)));
    el.parentElement!.classList.toggle("soon", next - now < 3600_000);
  }
  for (const ev of EVENTS) {
    const el = app.querySelector<HTMLElement>(`[data-ev="${ev.id}"]`);
    if (el) el.textContent = formatCountdown(nextEvent(ev, now, C.timeZone) - now);
  }
}

/** Fetches news, toasts new posts. Network errors keep the cached list. */
async function refreshNews() {
  try {
    const fresh = mergeNews(data, await fetchNews());
    newsError = "";
    if (fresh.length && data.settings.channels.news?.on && !(data.settings.mutedUntil > Date.now()))
      toast(data.settings, fresh.length === 1 ? "AION 2 news" : `${fresh.length} AION 2 news`, fresh.map((n) => n.title).join(" · "), ["news"]);
    await save();
  } catch (e) { newsError = "Offline: " + (e as Error).message; console.warn(e); }
  if (!(document.activeElement instanceof HTMLInputElement)) render();
}

// ---------- actions ----------
const task = (id: string) => data.tasks.find((t) => t.id === id)!;

function setCount(id: string, i: number, v: number) {
  const g = task(id).goals![i];
  const p = prog(id);
  p.counts ??= [];
  p.counts[i] = Math.max(0, Math.min(g.target, Math.round(v) || 0));
}

function move(id: string, dir: -1 | 1) {
  const t = task(id);
  const list = sorted(t.cadence);
  list.forEach((x, i) => (x.order = i)); // normalize
  const j = list.indexOf(t) + dir;
  if (j < 0 || j >= list.length) return;
  [t.order, list[j].order] = [list[j].order, t.order];
}

app.addEventListener("click", async (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tab],[data-act]");
  if (!el || el instanceof HTMLInputElement) return;
  if (el.dataset.act === "read") { // link or ✕: mark read, the link still opens
    const n = data.news.find((x) => x.gid === el.dataset.id);
    if (n) n.read = true;
    await save();
    return setTimeout(render); // after the default action, so the link isn't removed mid-click
  }
  if (el.dataset.tab) { tab = el.dataset.tab as Tab; return render(); }
  const id = el.dataset.id!, i = +(el.dataset.i ?? 0);
  switch (el.dataset.act) {
    case "inc": case "dec": {
      const g = task(id).goals![i];
      setCount(id, i, (prog(id).counts?.[i] ?? 0) + (el.dataset.act === "inc" ? 1 : -1) * (g.step ?? 1));
      break;
    }
    case "edit": editing = !editing; break;
    case "up": move(id, -1); break;
    case "down": move(id, 1); break;
    case "add": {
      const name = (app.querySelector<HTMLInputElement>("#new-name")!.value).trim();
      if (!name) return;
      try {
        data.tasks.push({
          id: crypto.randomUUID(), cadence: tab as Cadence, enabled: true, order: data.tasks.length, name,
          category: app.querySelector<HTMLInputElement>("#new-cat")!.value.trim() || "Other",
          goals: parseGoals(app.querySelector<HTMLInputElement>("#new-goals")!.value),
        });
      } catch (err) { return showStatus((err as Error).message, true); }
      break;
    }
    case "add-char": {
      const name = app.querySelector<HTMLInputElement>("#new-char")!.value.trim();
      if (!name) return;
      data.characters.push({ id: crypto.randomUUID(), name });
      break;
    }
    case "del-char": {
      const c = data.characters.find((c) => c.id === id);
      if (!c || data.characters.length < 2 || !confirm(`Delete ${c.name} and all its progress?`)) return;
      data.characters = data.characters.filter((c) => c.id !== id);
      delete data.progress[id];
      if (charId === id) charId = data.characters[0].id;
      break;
    }
    case "mute": data.settings.mutedUntil = Date.now() + 3600_000; break;
    case "unmute": data.settings.mutedUntil = 0; break;
    case "test": return toast(data.settings, "AION 2 Companion", "If you can read this, it works. Probably. 🎉");
    case "test-sound": return playSound(el.dataset.kind!.split(","), data.settings.volume * data.settings.channels[id].volume / 100);
    case "ch-mute": data.settings.channels[id].muted = !data.settings.channels[id].muted; break;
    case "hide-mascot": data.settings.memeMascot = false; break;
    case "export": return exportJson(data);
    case "refresh-news": return refreshNews();
    case "read-all": data.news.forEach((n) => (n.read = true)); break;
    default: return;
  }
  await save();
  render();
});

// <details> "toggle" doesn't bubble: listen in the capture phase.
app.addEventListener("toggle", (e) => {
  const d = e.target as HTMLDetailsElement;
  if (d.dataset.id) d.open ? openNews.add(d.dataset.id) : openNews.delete(d.dataset.id);
}, true);

app.addEventListener("change", async (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  if (el.id === "char") { charId = el.value; return render(); }
  const id = el.dataset.id!, v = el.value, checked = (el as HTMLInputElement).checked;
  switch (el.dataset.act) {
    case "toggle": prog(id).done = checked; if (checked) react(); break;
    case "set": setCount(id, +(el.dataset.i ?? 0), +v); break;
    case "name": if (v.trim()) task(id).name = v.trim(); break;
    case "cat": if (v.trim()) task(id).category = v.trim(); break;
    case "note": task(id).note = v.trim() || undefined; break;
    case "enabled": task(id).enabled = checked; break;
    case "goals":
      try { task(id).goals = parseGoals(v); } catch (err) { showStatus((err as Error).message, true); }
      break;
    case "rename-char": if (v.trim()) data.characters.find((c) => c.id === id)!.name = v.trim(); break;
    case "ch-on": data.settings.channels[id].on = checked; break;
    case "ch-vol": data.settings.channels[id].volume = Math.max(0, Math.min(100, +v || 0)); break;
    case "sound": data.settings.sound = checked; break;
    case "meme-mascot": data.settings.memeMascot = checked; break;
    case "volume": data.settings.volume = Math.max(0, Math.min(100, +v || 0)); break;
    case "warn": data.settings.warnHours[el.dataset.cad as Cadence] = Math.max(0, +v || 0); break;
    case "quiet-start": data.settings.quietStart = v; break;
    case "quiet-end": data.settings.quietEnd = v; break;
    case "autostart":
      await (checked ? enable() : disable());
      autostart = await isEnabled();
      break;
    case "import": {
      const file = (el as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        data = await importJson(file);
        charId = data.characters[0].id;
        applyResets(data, Date.now(), C);
        showStatus("Import complete. Stonks 📈");
      } catch (err) { showStatus("Import failed (skill issue): " + (err as Error).message, true); }
      break;
    }
    default: return;
  }
  await save();
  render();
});

// ---------- startup ----------
async function main() {
  data = await loadData();
  charId = data.characters[0].id;
  if (isTauri()) autostart = await isEnabled().catch(() => false);
  applyResets(data, Date.now(), C);
  checkNotifications(data, Date.now());
  await save();
  render();

  if (isTauri()) await listen("tray-mute", async () => {
    data.settings.mutedUntil = Date.now() + 3600_000;
    await save();
    render();
  });

  if (isTauri()) checkUpdate();
  refreshNews();
  let ticks = 0;
  setInterval(async () => {
    updateCountdowns();
    if (++ticks % 1800 === 0) refreshNews(); // every 30 min
    if (ticks % 15) return; // every 15 s: resets and notifications
    const now = Date.now();
    const reset = applyResets(data, now, C).length > 0;
    if (checkNotifications(data, now) || reset) await save();
    // Don't re-render while the user is typing in a field.
    if (reset && !(document.activeElement instanceof HTMLInputElement)) render();
  }, 1000);
}

// Update from GitHub Releases; the Windows installer closes and relaunches the app itself.
async function checkUpdate() {
  try {
    const update = await check();
    if (update && confirm(`AION 2 Companion ${update.version} is available. Install it now?`)) {
      showStatus("Downloading update…");
      await update.downloadAndInstall();
    }
  } catch (e) { console.warn("Update check failed", e); }
}

main().catch((e) => { app.textContent = "Startup error: " + e; console.error(e); });
