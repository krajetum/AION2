import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { check } from "@tauri-apps/plugin-updater";
import { EVENTS, RESET_CONFIG as C, SEASON } from "./config.ts";
import { exportJson, importJson, loadData, saveData } from "./data.ts";
import { fetchNews, isImportant, mergeNews } from "./news.ts";
import { channelVolume, CHANNELS, checkNotifications, playSound, toast } from "./notify.ts";
import { cleanLeads } from "./domain/alerts.ts";
import { DEFAULT_MINUTES, DEFAULT_PRIORITY, learn, leftShare, plan, type Step } from "./domain/planner.ts";
import { applyResets } from "./domain/resets.ts";
import { emptySeason, isHardPvp, isIncluded, remainingOf, SEASONAL, seasonSummary, WEEKLY, weeksLeft } from "./domain/season.ts";
import { formatGoals, isDone, parseGoals } from "./domain/tasks.ts";
import { formatCountdown, lastBoundary, nextBoundary, nextEvent } from "./domain/time.ts";
import { CADENCES, type AppData, type Cadence, type Progress, type Task } from "./domain/types.ts";
import { lastUndo, popUndo, pushUndo } from "./domain/undo.ts";

type Tab = Cadence | "plan" | "season" | "news" | "settings";
const TABS: Tab[] = [...CADENCES, "plan", "season", "news", "settings"];
// 16px outline icons (1.5 stroke, currentColor). Paths are 24x24.
const icon = (d: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  daily: icon(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`),
  weekly: icon(`<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h10"/>`),
  monthly: icon(`<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2"/>`),
  plan: icon(`<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4"/>`),
  season: icon(`<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>`),
  news: icon(`<path d="M5 4h12v16H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1zM17 8h3v10a2 2 0 0 1-2 2"/><path d="M8 8h6M8 12h6M8 16h4"/>`),
  settings: icon(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`),
  close: icon(`<path d="M6 6l12 12M18 6L6 18"/>`),
  sound: icon(`<path d="M11 5L6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>`),
  muted: icon(`<path d="M11 5L6 9H3v6h3l5 4V5zM16 9l5 6M21 9l-5 6"/>`),
  play: icon(`<path d="M7 5l12 7-12 7V5z"/>`),
};
// Sidebar label and page header tagline.
const PAGE: Record<Tab, [string, string]> = {
  daily: ["Daily", "The grind never sleeps. You should, though."],
  weekly: ["Weekly", "Wednesday is coming."],
  monthly: ["Monthly", "Long-term commitment issues."],
  plan: ["Planner", "Limited minutes, unlimited greed. Knapsack go brrr."],
  season: ["Season Coins", "Oath Coin stonks. Numbers only go up."],
  news: ["News", "Patch notes or it didn't happen."],
  settings: ["Settings", "Knobs. So many knobs."],
};
const tabFromHash = (): Tab => { const h = location.hash.slice(1) as Tab; return TABS.includes(h) ? h : "daily"; };
const LABEL: Record<Cadence, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

let data: AppData;
let charId = "";
let tab: Tab = tabFromHash(); // the page lives in the URL hash so a reload keeps it
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
// w/h reserve the box so the layout doesn't jump when the image loads (object-fit keeps the real aspect).
const meme = (src: string | undefined, cls: string, w: number, h: number) =>
  src ? `<img class="meme ${cls}" src="${src}" alt="" width="${w}" height="${h}">` : "";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const save = () => saveData(data).catch((e) => console.error("Save failed", e));

const sorted = (cad: Cadence) => data.tasks.filter((t) => t.cadence === cad).sort((a, b) => a.order - b.order);
const sp = () => (data.season[charId] ??= emptySeason());
const num = (n: number) => n.toLocaleString("en-US");
const prog = (taskId: string) => ((data.progress[charId] ??= {})[taskId] ??= { done: false });

// ---------- render ----------
function render() {
  const chars = data.characters.map((c) => `<option value="${c.id}" ${c.id === charId ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  const unread = data.news.filter((n) => !n.read).length;
  const extra = (t: Tab) => {
    if (t === "settings") return "";
    if (t === "news") return unread ? `<span class="badge">${unread}</span>` : "";
    if (t === "plan") { const pl = activePlan(Date.now()); return pl ? `<span class="count">${Math.ceil(planLeft(pl, Date.now()))}m</span>` : ""; }
    if (t === "season") {
      const left = seasonSummary(sp(), 0).seasonalRemaining;
      return `<span class="count">${left >= 10_000 ? Math.round(left / 1000) + "k" : num(left)}</span>`;
    }
    const tasks = data.tasks.filter((x) => x.enabled && x.cadence === t);
    const done = tasks.filter((x) => isDone(x, data.progress[charId]?.[x.id])).length;
    return `<span class="count">${done}/${tasks.length}</span>`;
  };
  const tabs = TABS.map((t) =>
    `<button class="tab" data-tab="${t}" title="${PAGE[t][0]}" ${t === tab ? `aria-current="page"` : ""}>
      ${ICON[t]}<span class="lbl">${PAGE[t][0]}</span>${extra(t)}</button>`).join("");
  const banner = data.news.filter((n) => !n.read && isImportant(n)).map((n) =>
    `<div class="banner"><a href="${esc(n.url)}" target="_blank" rel="noopener" data-act="read" data-id="${esc(n.gid)}">${esc(n.title)}</a>
      <button class="ghost" data-act="read" data-id="${esc(n.gid)}" aria-label="Dismiss" title="Dismiss">${ICON.close}</button></div>`).join("");
  const muted = data.settings.mutedUntil > Date.now()
    ? `<span class="chip">Shhh until ${new Date(data.settings.mutedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        <button data-act="unmute">Unshhh</button></span>` : "";
  app.innerHTML = `
    <header>
      ${data.settings.memeMascot && MEME.mascot ? `<button class="mascot" data-act="hide-mascot" aria-label="Hide mascot" title="Click to hide">${meme(MEME.mascot, "", 80, 44)}</button>` : ""}
      <div class="brand" translate="no"><b>AION 2</b><span>Companion™</span><small>no bots, I swear</small></div>
      ${muted}
      <label class="char">Character <select id="char">${chars}</select></label>
    </header>
    <div class="timers">
      ${CADENCES.map((c) => `<div class="timer"><small>${LABEL[c]} copium refill</small><span data-cd="${c}"></span></div>`).join("")}
      ${EVENTS.map((ev) => `<div class="timer event"><small>${esc(ev.name)}</small><span data-ev="${ev.id}"></span></div>`).join("")}
    </div>
    ${banner}
    <div class="layout">
      <main>
        <div class="page-head"><h1>${PAGE[tab][0]}</h1><p>${PAGE[tab][1]}</p></div>
        ${tab === "settings" ? settingsView() : tab === "news" ? newsView() : tab === "season" ? seasonView() : tab === "plan" ? planView() : listView(tab)}</main>
      <nav class="side" aria-label="Pages">${tabs}</nav>
    </div>`;
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
    ? `<section class="win">${meme(MEME.win, "", 120, 90)}<div><h2>GG EZ — all ${LABEL[cad].toLowerCase()} tasks done</h2><p>Go touch grass. The reset will find you.</p></div></section>` : "";
  const empty = `<p class="empty">${meme(MEME.empty, "", 160, 120)}It's empty. Like my Kina wallet. Click <b>Edit tasks</b> to add one.</p>`;
  const touched = all.some((t) => data.progress[charId]?.[t.id]);
  return `<div class="toolbar">${editing ? "" : `${undoButton()}
      <button class="ghost" data-act="reset-cad" data-cad="${cad}" ${touched ? "" : "disabled"} title="Clears ${LABEL[cad].toLowerCase()} progress for this character. Undoable.">Reset ${LABEL[cad]}</button>`}
    <button class="${editing ? "primary" : ""}" data-act="edit">${editing ? "Done (trust me bro)" : "Edit tasks (big brain)"}</button></div>${win}${groups || empty}${add}`;
}

function undoButton() {
  const e = lastUndo(data, charId);
  return `<button class="ghost" data-act="undo" ${e ? `title="Ctrl+Z"` : "disabled"}>${e ? `Undo: ${esc(e.label)}` : "Nothing to undo"}</button>`;
}

function taskRow(t: Task, hint = "") {
  const p = data.progress[charId]?.[t.id];
  const goals = (t.goals ?? []).map((g, i) => {
    const v = p?.counts?.[i] ?? 0;
    const name = esc(g.label ?? t.name);
    return `<div class="goal ${v >= g.target ? "ok" : ""}">
      <div class="stepper">${g.label ? `<span class="of">${esc(g.label)}</span>` : ""}
        <button data-act="dec" data-id="${t.id}" data-i="${i}" aria-label="Decrease ${name}">−</button>
        <input type="number" inputmode="numeric" min="0" max="${g.target}" step="${g.step ?? 1}" value="${v}" data-act="set" data-id="${t.id}" data-i="${i}" aria-label="${name}">
        <span class="of">/ ${g.target}</span>
        <button data-act="inc" data-id="${t.id}" data-i="${i}" aria-label="Increase ${name}">+</button></div>
      <div class="bar"><i style="--p:${Math.min(1, v / g.target)}"></i></div></div>`;
  }).join("");
  return `<div class="task ${isDone(t, p) ? "done" : ""}">
    <label><input type="checkbox" data-act="toggle" data-id="${t.id}" ${isDone(t, p) ? "checked" : ""}>
      <span class="text"><span class="name">${esc(t.name)}</span>${t.note ? `<small>${esc(t.note)}</small>` : ""}${hint ? `<small class="plan-hint">${hint}</small>` : ""}</span></label>
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
      <a href="${esc(n.url)}" target="_blank" rel="noopener" data-act="read" data-id="${esc(n.gid)}">${esc(n.title)}</a>${isImportant(n) ? `<span class="pill">Important</span>` : ""}
      <small>${new Date(n.date * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</small>
      <p>${esc(n.contents)}</p>
      ${n.contents.length > 220 || n.contents.split("\n").length > 3 ? `<details data-id="${esc(n.gid)}" ${openNews.has(n.gid) ? "open" : ""}>
        <summary><span>Show more</span><span>Show less</span></summary></details>` : ""}</article>`).join("");
  return `<div class="toolbar">${newsError ? `<span class="note">${esc(newsError)}</span>` : ""}
      <button class="ghost" data-act="read-all">Pretend I read them</button><button data-act="refresh-news">F5</button></div>
    <section><h2>Official announcements <span class="count">Steam</span></h2>${items || `<p class="empty">${meme(MEME.empty, "", 160, 120)}No news. Devs are cooking.</p>`}</section>`;
}

function seasonView() {
  const s = sp(), weeks = weeksLeft(Date.now(), C, SEASON.end), sum = seasonSummary(s, weeks);
  const total = SEASONAL.reduce((a, m) => a + m.coins, 0);
  const end = new Date(SEASON.end + "T00:00").toLocaleDateString("en-GB", { dateStyle: "medium" });
  const kpi = (label: string, v: number, sub: string, cls = "") =>
    `<div class="kpi ${cls}"><small>${label}</small><b>${num(v)}</b><span>${sub}</span></div>`;
  const sw = (act: string, i: number, on: boolean, label: string) =>
    `<label class="switch"><input type="checkbox" data-act="${act}" data-i="${i}" ${on ? "checked" : ""} aria-label="${esc(label)}"></label>`;
  const named = (m: { name: string; note?: string }) => `<span class="name">${esc(m.name)}</span>${m.note ? `<small>${esc(m.note)}</small>` : ""}`;
  const seasonal = sum.tabs.map((t) => {
    const rows = SEASONAL.map((m, i) => [m, i] as const).filter(([m]) => m.tab === t.tab).map(([m, i]) => {
      const c = s.claimed[m.name] ?? 0, rem = remainingOf(m, s);
      return `<tr class="${rem <= 0 ? "done" : ""}">
        <td>${named(m)}</td><td class="n">${m.steps}</td><td class="n">${m.ap ? num(m.ap) : "–"}</td>
        <td><div class="goal ${rem <= 0 ? "ok" : ""}"><div class="stepper">
          <input type="number" inputmode="numeric" min="0" max="${m.coins}" step="10" value="${c}" data-act="claim" data-i="${i}" aria-label="${esc(m.name)} coins claimed">
          <span class="of">/ ${num(m.coins)}</span></div>
          <div class="bar"><i style="--p:${Math.min(1, c / m.coins)}"></i></div></div></td>
        <td class="n ${rem < 0 ? "neg" : ""}">${rem ? num(rem) : "–"}</td>
        <td class="c">${sw("hardpvp", i, isHardPvp(m, s), `${m.name} is hard PvP`)}</td></tr>`;
    }).join("");
    return `<section><h2>${esc(t.tab)} <span class="count">${num(t.remaining)} left</span></h2><div class="scroll"><table class="sheet">
      <thead><tr><th>Mission</th><th class="n">Steps</th><th class="n">AP</th><th>Claimed</th><th class="n">Left</th><th class="c">Hard PvP</th></tr></thead>
      <tbody>${rows}</tbody></table></div></section>`;
  }).join("");
  const weekly = WEEKLY.map((m, i) => `<tr class="${isIncluded(m, s) ? "" : "off"}">
      <td class="dim">${esc(m.tab)}</td><td>${named(m)}</td><td class="n">${m.steps}</td>
      <td class="n">${num(m.coins)}</td><td class="n">${m.ap ? num(m.ap) : "–"}</td>
      <td class="c">${sw("included", i, isIncluded(m, s), `Count ${m.name}`)}</td></tr>`).join("");
  const win = sum.seasonalRemaining <= 0
    ? `<section class="win">${meme(MEME.win, "", 120, 90)}<div><h2>Seasonal coins: 100% looted</h2><p>Only weeklies left. Touch grass, come back Wednesday.</p></div></section>` : "";
  return `${win}<div class="kpis">
      ${kpi("Realistic at season end", sum.realisticEnd, "no sweaty PvP", "hero")}
      ${kpi("Max at season end", sum.maxAtEnd, "if you PvP like a god")}
      ${kpi("Seasonal left", sum.seasonalRemaining, `of ${num(total)}`)}
      ${kpi("Weekly income", sum.weeklyCoins, `× ${weeks} weeks = ${num(sum.futureWeekly)}`)}
    </div>
    <div class="settings"><div>
      <section class="wallet"><h2>Wallet</h2>
        <label class="setting"><span>Current coins</span><input type="number" inputmode="numeric" min="0" step="10" value="${s.coins}" data-act="season-coins"></label>
        <label class="setting"><span>Still to claim this week</span><input type="number" inputmode="numeric" min="0" step="10" value="${s.thisWeek}" data-act="season-week"></label>
        <dl class="calc">
          <dt>Total obtainable</dt><dd>${num(sum.totalObtainable)}</dd>
          <dt>Hard PvP left</dt><dd>${num(sum.hardPvpRemaining)}</dd>
          <dt>Realistic obtainable</dt><dd>${num(sum.realistic)}</dd>
          <dt>Weekly AP</dt><dd>${num(sum.weeklyAp)}</dd>
        </dl>
        <p class="hint">${esc(SEASON.name)} ends ${end} · ${weeks} weekly resets left</p>
      </section></div><div>
      <section><h2>By tab</h2><div class="scroll"><table class="sheet">
        <thead><tr><th>Tab</th><th class="n">Weekly</th><th class="n">Seasonal</th><th class="n">Left</th></tr></thead>
        <tbody>${sum.tabs.map((t) => `<tr><td>${esc(t.tab)}</td><td class="n">${num(t.weekly)}</td><td class="n">${num(t.total)}</td><td class="n">${num(t.remaining)}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td>Total</td><td class="n">${num(sum.weeklyCoins)}</td><td class="n">${num(total)}</td><td class="n">${num(sum.seasonalRemaining)}</td></tr></tfoot>
      </table></div></section></div></div>
    ${seasonal}
    <section><h2>Weekly missions <span class="count">${num(sum.weeklyCoins)} / week</span></h2><div class="scroll"><table class="sheet">
      <thead><tr><th>Tab</th><th>Mission</th><th class="n">Steps</th><th class="n">Coins</th><th class="n">AP</th><th class="c">Counted</th></tr></thead>
      <tbody>${weekly}</tbody></table></div></section>`;
}

// ---------- planner ----------
const MIN = 60_000;
const hm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const mins = (m: number) => (m < 1 ? "<1 min" : `${Math.round(m)} min`);
const PRIO = ["Low", "Normal", "High"];
/** The running session for the current character, if it hasn't run out. */
function activePlan(now: number) {
  const pl = data.plan;
  return pl && pl.charId === charId && now < pl.start + pl.minutes * MIN ? pl : undefined;
}
const planLeft = (pl: NonNullable<AppData["plan"]>, now: number) => (pl.start + pl.minutes * MIN - now) / MIN;

// Tasks finished from the Planner page: kept on screen (ticked) so the tick is visible and can be undone.
const doneHere = new Set<string>();

/** Runs a progress change; during a session, times it to refine the task's estimate. */
function track(id: string, change: () => void) {
  const t = task(id), before = leftShare(t, data.progress[charId]?.[id]);
  pushUndo(data, charId, t.name, { [id]: structuredClone(data.progress[charId]?.[id]) ?? null }, Date.now());
  change();
  const after = leftShare(t, data.progress[charId]?.[id]);
  if (tab === "plan" && !after) doneHere.add(id);
  const now = Date.now(), pl = activePlan(now), share = before - after;
  if (!pl || share <= 0) return;
  t.minutes = learn(t.minutes ?? DEFAULT_MINUTES, (now - pl.lastMark) / MIN, share);
  pl.lastMark = now;
}

/** "Wins +4 · Entries +2" for a step that does only part of a goal task. */
function stepUnits(t: Task, st: Step) {
  const p = data.progress[charId]?.[t.id];
  const units = (t.goals ?? []).map((g, i) => {
    const left = Math.max(0, g.target - (p?.counts?.[i] ?? 0));
    return { g, left, n: Math.min(left, Math.ceil((st.part ?? 1) * g.target)) };
  });
  if (units.every((u) => u.n >= u.left)) return "";
  return units.filter((u) => u.n).map((u) => `${esc(u.g.label ?? "")} +${u.n}`.trim()).join(" · ");
}

function planView() {
  const s = data.settings, now = Date.now(), pl = activePlan(now);
  const r = plan({
    tasks: data.tasks, progress: data.progress[charId] ?? {},
    events: EVENTS.filter((ev) => s.channels[ev.id]?.on), // events you get alerts for = events you play
    now, minutes: pl ? planLeft(pl, now) : s.planMinutes, nextSessionHours: s.planNextHours, config: C,
  });
  const urgentOut = r.skipped.filter((x) => x.urgent).length;
  const planned = new Set(r.steps.filter((x) => x.kind === "task").map((x) => x.id)).size;
  const kpi = (label: string, v: string, sub: string, cls = "") => `<div class="kpi ${cls}"><small>${label}</small><b>${v}</b><span>${sub}</span></div>`;

  const steps = r.steps.map((st) => {
    const time = `<time>${hm(st.start)}</time>`;
    if (st.kind === "event") return `<div class="step event">${time}<div class="task"><span class="text">
      <span class="name">${esc(st.name)}</span><small class="plan-hint">Event · ${mins(st.minutes)} reserved</small></span></div></div>`;
    const t = task(st.id), units = stepUnits(t, st);
    const hint = [`~${mins(st.minutes)}`, units && `do ${units}, rest later`, st.urgent && "resets before your next session"].filter(Boolean).join(" · ");
    return `<div class="step ${st.urgent ? "urgent" : ""}">${time}${taskRow(t, hint)}</div>`;
  }).join("");
  const done = [...doneHere].filter((id) => isDone(task(id), data.progress[charId]?.[id])).map((id) => taskRow(task(id))).join("");
  const skipped = r.skipped.map((x) => `<div class="task"><span class="text"><span class="name">${esc(x.name)}</span>
      <small>${mins(x.minutes)}${x.urgent ? ` · <span class="neg">resets before your next session</span>` : ""}</small></span></div>`).join("");
  const est = data.tasks.filter((t) => t.enabled && leftShare(t, data.progress[charId]?.[t.id]) > 0)
    .sort((a, b) => CADENCES.indexOf(a.cadence) - CADENCES.indexOf(b.cadence) || a.order - b.order)
    .map((t) => `<tr><td class="dim">${LABEL[t.cadence]}</td><td><span class="name">${esc(t.name)}</span></td>
      <td class="n"><input type="number" inputmode="decimal" min="0.5" max="600" step="0.5" value="${t.minutes ?? DEFAULT_MINUTES}" data-act="plan-est" data-id="${t.id}" aria-label="${esc(t.name)} minutes"></td>
      <td class="c"><select data-act="plan-prio" data-id="${t.id}" aria-label="${esc(t.name)} priority">${PRIO.map((l, i) =>
        `<option value="${i + 1}" ${(t.priority ?? DEFAULT_PRIORITY) === i + 1 ? "selected" : ""}>${l}</option>`).join("")}</select></td></tr>`).join("");

  const empty = r.candidates
    ? `<p class="empty">${meme(MEME.empty, "", 160, 120)}Nothing fits in ${mins(pl ? planLeft(pl, now) : s.planMinutes)}. Go get a coffee.</p>`
    : `<section class="win">${meme(MEME.win, "", 120, 90)}<div><h2>Nothing left to plan</h2><p>Everything is done. Touch grass.</p></div></section>`;
  return `<div class="toolbar plan-bar">
      ${[20, 40, 60, 90].map((m) => `<button class="${!pl && s.planMinutes === m ? "primary" : ""}" data-act="plan-preset" data-m="${m}" ${pl ? "disabled" : ""}>${m} min</button>`).join("")}
      <label>Custom <input type="number" inputmode="numeric" min="5" max="600" step="5" value="${s.planMinutes}" data-act="plan-minutes" ${pl ? "disabled" : ""} aria-label="Session minutes"> min</label>
      <label>Next session in <input type="number" inputmode="numeric" min="1" max="168" value="${s.planNextHours}" data-act="plan-next" aria-label="Hours until the next session"> h</label>
      ${undoButton()}
      ${pl ? `<button data-act="plan-stop">Stop session</button>` : `<button class="primary" data-act="plan-start">Start session</button>`}
    </div>
    <div class="kpis">
      ${kpi(pl ? "Session left" : "Preview", pl ? mins(planLeft(pl, now)) : mins(s.planMinutes), pl ? `started ${hm(pl.start)} · learning your timings` : "start to learn your timings", "hero")}
      ${kpi("Planned", `${planned}/${r.candidates}`, "unfinished tasks")}
      ${kpi("Ends around", hm(r.end), r.steps.some((x) => x.kind === "event") ? "events included" : "no events in the window")}
      ${kpi("Left out", String(r.skipped.length), urgentOut ? `<span class="neg">${urgentOut} reset before next session</span>` : "nothing urgent lost")}
    </div>
    ${steps ? `<section><h2>Plan <span class="count">${r.steps.length} steps</span></h2>${steps}</section>` : empty}
    ${done ? `<section><h2>Done just now <span class="count">ticked in your Daily / Weekly / Monthly lists too</span></h2>${done}</section>` : ""}
    ${skipped ? `<section><h2>Doesn't fit <span class="count">${r.skipped.length}</span></h2>${skipped}</section>` : ""}
    ${est ? `<section><h2>Estimates <span class="count">minutes for the whole task</span></h2><div class="scroll"><table class="sheet">
      <thead><tr><th>Cadence</th><th>Task</th><th class="n">Minutes</th><th class="c">Priority</th></tr></thead>
      <tbody>${est}</tbody></table></div>
      <p class="hint">During a session, the time between two ticks updates the estimate. Events count only if their alert is on in Settings.</p></section>` : ""}`;
}

/** Event alert lead times: 1–3 editable minute fields + a preview of when the next alerts arrive. */
function leadsRow(id: string, leads: number[], on: boolean) {
  const ev = EVENTS.find((e) => e.id === id)!, next = nextEvent(ev, Date.now(), C.timeZone);
  const hm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `<div class="leads">
    ${leads.map((m, i) => `<span class="lead"><input type="number" inputmode="numeric" min="1" max="60" value="${m}" data-act="lead" data-id="${id}" data-i="${i}" aria-label="${esc(ev.name)} alert ${i + 1}, minutes before">min
      ${leads.length > 1 ? `<button class="ghost" data-act="lead-del" data-id="${id}" data-i="${i}" aria-label="Remove ${m} min alert" title="Remove">×</button>` : ""}</span>`).join("")}
    ${leads.length < 3 ? `<button class="ghost" data-act="lead-add" data-id="${id}" title="Up to 3 alerts">+ Add</button>` : ""}
    ${on ? `<span class="hint">Next: ${leads.map((m) => hm(next - m * 60_000)).join(" · ")}</span>` : ""}</div>`;
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
        <span class="ctl"><input type="number" inputmode="numeric" min="0" max="168" value="${s.warnHours[c]}" data-act="warn" data-cad="${c}"> h before</span></label>`).join("")}
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
          <button class="ghost" data-act="ch-mute" data-id="${c.id}" aria-pressed="${ch.muted}" aria-label="Mute ${name} sound" title="${ch.muted ? "Unmute" : "Mute"} sound">${ch.muted ? ICON.muted : ICON.sound}</button>
          <button class="ghost" data-act="test-sound" data-kind="${c.sound}" data-id="${c.id}" aria-label="Play ${name} sound" title="sounds/${c.sound[0]}.wav">${ICON.play}</button></span>
        ${ch.leads ? leadsRow(c.id, ch.leads, ch.on) : ""}</div>`; }).join("")}
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
  p.done = task(id).goals!.every((x, j) => (p.counts![j] ?? 0) >= x.target);
}

/** Checkbox. Unticking a goal task whose goals are all reached clears its counts too,
 *  otherwise isDone() would keep it done; partial counts are kept. */
function setDone(id: string, done: boolean) {
  const t = task(id), p = prog(id);
  p.done = done;
  if (!done && t.goals?.every((g, i) => (p.counts?.[i] ?? 0) >= g.target)) p.counts = [];
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
  if (el.dataset.act === "read") { // link or dismiss: mark read, the link still opens
    const n = data.news.find((x) => x.gid === el.dataset.id);
    if (n) n.read = true;
    await save();
    return setTimeout(render); // after the default action, so the link isn't removed mid-click
  }
  if (el.dataset.tab) { tab = el.dataset.tab as Tab; history.replaceState(null, "", "#" + tab); return render(); }
  const id = el.dataset.id!, i = +(el.dataset.i ?? 0);
  switch (el.dataset.act) {
    case "inc": case "dec": {
      const g = task(id).goals![i];
      track(id, () => setCount(id, i, (prog(id).counts?.[i] ?? 0) + (el.dataset.act === "inc" ? 1 : -1) * (g.step ?? 1)));
      break;
    }
    case "undo": return undo();
    case "reset-cad": {
      const cad = el.dataset.cad as Cadence, prog = data.progress[charId] ?? {}, before: Record<string, Progress> = {};
      for (const t of data.tasks) if (t.cadence === cad && prog[t.id]) { before[t.id] = prog[t.id]; delete prog[t.id]; }
      if (!Object.keys(before).length) return;
      pushUndo(data, charId, `Reset ${LABEL[cad]}`, before, Date.now());
      showStatus(`${LABEL[cad]} reset. Ctrl+Z to undo.`);
      break;
    }
    case "plan-preset": data.settings.planMinutes = +el.dataset.m!; break;
    case "plan-start": { const now = Date.now(); data.plan = { charId, start: now, minutes: data.settings.planMinutes, lastMark: now }; break; }
    case "plan-stop": delete data.plan; break;
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
      delete data.season[id];
      if (charId === id) charId = data.characters[0].id;
      break;
    }
    case "mute": data.settings.mutedUntil = Date.now() + 3600_000; break;
    case "unmute": data.settings.mutedUntil = 0; break;
    case "test": return toast(data.settings, "AION 2 Companion", "If you can read this, it works. Probably.");
    case "test-sound": return playSound(el.dataset.kind!.split(","), data.settings.volume * data.settings.channels[id].volume / 100);
    case "ch-mute": data.settings.channels[id].muted = !data.settings.channels[id].muted; break;
    case "lead-add": {
      const ch = data.settings.channels[id];
      ch.leads = cleanLeads([...ch.leads!, [10, 5, 3, 2, 1].find((m) => !ch.leads!.includes(m))]);
      break;
    }
    case "lead-del": data.settings.channels[id].leads!.splice(i, 1); break;
    case "hide-mascot": data.settings.memeMascot = false; break;
    case "export": return exportJson(data);
    case "refresh-news": return refreshNews();
    case "read-all": data.news.forEach((n) => (n.read = true)); break;
    default: return;
  }
  await save();
  render();
});

async function undo() {
  const label = popUndo(data, charId);
  if (!label) return;
  showStatus(`Undone: ${label}`);
  await save();
  render();
}
// Ctrl+Z anywhere except inside a field (the field's own undo wins there).
addEventListener("keydown", (e) => {
  const f = document.activeElement;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !(f instanceof HTMLInputElement || f instanceof HTMLSelectElement)) {
    e.preventDefault();
    undo();
  }
});

// <details> "toggle" doesn't bubble: listen in the capture phase.
app.addEventListener("toggle", (e) => {
  const d = e.target as HTMLDetailsElement;
  if (d.dataset.id) d.open ? openNews.add(d.dataset.id) : openNews.delete(d.dataset.id);
}, true);

app.addEventListener("change", async (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  if (el.id === "char") { charId = el.value; doneHere.clear(); return render(); }
  const id = el.dataset.id!, v = el.value, checked = (el as HTMLInputElement).checked;
  switch (el.dataset.act) {
    case "toggle": track(id, () => setDone(id, checked)); if (checked) react(); break;
    case "set": track(id, () => setCount(id, +(el.dataset.i ?? 0), +v)); break;
    case "plan-minutes": data.settings.planMinutes = Math.max(5, Math.min(600, Math.round(+v) || 40)); break;
    case "plan-next": data.settings.planNextHours = Math.max(1, Math.min(168, Math.round(+v) || 20)); break;
    case "plan-est": task(id).minutes = Math.max(0.5, Math.min(600, Math.round(+v * 2) / 2 || DEFAULT_MINUTES)); break;
    case "plan-prio": task(id).priority = Math.max(1, Math.min(3, +v || DEFAULT_PRIORITY)); break;
    case "name": if (v.trim()) task(id).name = v.trim(); break;
    case "cat": if (v.trim()) task(id).category = v.trim(); break;
    case "note": task(id).note = v.trim() || undefined; break;
    case "enabled": task(id).enabled = checked; break;
    case "goals":
      try { task(id).goals = parseGoals(v); } catch (err) { showStatus((err as Error).message, true); }
      break;
    case "season-coins": sp().coins = Math.max(0, Math.round(+v) || 0); break;
    case "season-week": sp().thisWeek = Math.max(0, Math.round(+v) || 0); break;
    case "claim": {
      const m = SEASONAL[+el.dataset.i!], c = Math.max(0, Math.round(+v) || 0);
      if (c) sp().claimed[m.name] = c; else delete sp().claimed[m.name];
      break;
    }
    case "hardpvp": {
      const m = SEASONAL[+el.dataset.i!];
      if (checked === !!m.hardPvp) delete sp().hardPvp[m.name]; else sp().hardPvp[m.name] = checked;
      break;
    }
    case "included": {
      const m = WEEKLY[+el.dataset.i!];
      if (checked) delete sp().excluded[m.name]; else sp().excluded[m.name] = true;
      break;
    }
    case "rename-char": if (v.trim()) data.characters.find((c) => c.id === id)!.name = v.trim(); break;
    case "ch-on": data.settings.channels[id].on = checked; break;
    case "ch-vol": data.settings.channels[id].volume = Math.max(0, Math.min(100, +v || 0)); break;
    case "lead": { // a duplicate collapses; render() puts the field back to the clean list
      const ch = data.settings.channels[id], leads = [...ch.leads!];
      leads[+el.dataset.i!] = Math.max(1, Math.min(60, Math.round(+v) || 1));
      ch.leads = cleanLeads(leads);
      break;
    }
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
        showStatus("Import complete. Stonks.");
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

  addEventListener("hashchange", () => { tab = tabFromHash(); render(); });
  if (isTauri()) checkUpdate();
  refreshNews();
  let ticks = 0;
  setInterval(async () => {
    updateCountdowns();
    if (++ticks % 1800 === 0) refreshNews(); // every 30 min
    // Planner times move with the clock: refresh it every minute unless a field is in use.
    if (tab === "plan" && ticks % 60 === 0 && !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement)) render();
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
