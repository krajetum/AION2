<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { NativeSelect, NativeSelectOption } from "$lib/components/ui/native-select/index.js";
  import { EVENTS, RESET_CONFIG as C } from "../config.ts";
  import { activePlan, planLeft } from "../app/planner.ts";
  import { seasonOf } from "../app/season.ts";
  import { addCharacter } from "../app/characters.ts";
  import { addTrigger } from "../app/tasks.ts";
  import { triggerLabel, type Trigger } from "../domain/triggers.ts";
  import { unmute } from "../app/settings.ts";
  import { gameActive } from "../app/crowd.ts";
  import { bossBoard, bossLabel } from "../domain/bosses.ts";
  import { classColor, sameName } from "../domain/meter.ts";
  import { apByDay, apSince, pickWallet, walletRows } from "../domain/wallet.ts";
  import { isImportant } from "../domain/news.ts";
  import { emptySeason, seasonSummary } from "../domain/season.ts";
  import { isDone } from "../domain/tasks.ts";
  import { formatCountdown, lastBoundary, nextBoundary, nextEvent } from "../domain/time.ts";
  import { CADENCES } from "../domain/types.ts";
  import { act, markRead, undo } from "./actions.ts";
  import { hm, LABEL, num, PAGE } from "./format.ts";
  import { ICON } from "./icons.ts";
  import { playBirthday } from "../infra/notifier.ts";
  import balloons from "../assets/birthday/balloons.png";
  import cake from "../assets/birthday/cake.png";
  import confetti from "../assets/birthday/confetti.png";
  import gift from "../assets/birthday/gift.png";
  import Arena from "./pages/Arena.svelte";
  import Pets from "./pages/Pets.svelte";
  import Bosses from "./pages/Bosses.svelte";
  import Dps from "./pages/Dps.svelte";
  import Fights from "./pages/Fights.svelte";
  import MapPage from "./pages/Map.svelte";
  import Home from "./pages/Home.svelte";
  import News from "./pages/News.svelte";
  import Planner from "./pages/Planner.svelte";
  import Season from "./pages/Season.svelte";
  import Crafting from "./pages/Crafting.svelte";
  import Players from "./pages/Players.svelte";
  import Guild from "./pages/Guild.svelte";
  import Enhance from "./pages/Enhance.svelte";
  import Settings from "./pages/Settings.svelte";
  import Wiki from "./pages/Wiki.svelte";
  import Trophies from "./pages/Trophies.svelte";
  import Spark from "./parts/Spark.svelte";
  import { tally, trophies } from "../domain/trophies.ts";
  import TaskList from "./pages/TaskList.svelte";
  import Amount from "./parts/Amount.svelte";
  import Confetti from "./parts/Confetti.svelte";
  import Mascot from "./parts/Mascot.svelte";
  import Palette from "./parts/Palette.svelte";
  import { fade } from "svelte/transition";
  import Winter from "./parts/Winter.svelte";
  import { halloweenActive, winterActive } from "../domain/holiday.ts";
  import { winterNow } from "./winter.ts";
  import { doneHere, GROUPS, tabFromHash, ui, type Tab } from "./state.svelte.ts";

  // Every character always has a season entry once shown (the save file has always had it).
  $effect.pre(() => { seasonOf(ui.data, ui.charId); });

  const s = $derived(ui.data.settings);
  // The winter theme (1 December to 6 January): the palette in app.css follows `data-season` on <html>.
  const winter = $derived(s.winterTheme && winterActive(winterNow(ui.now)));
  // Halloween (25 October to 1 November): colours only.
  const season = $derived(winter ? "winter" : s.halloween && halloweenActive(winterNow(ui.now)) ? "halloween" : "");
  $effect(() => {
    if (season) document.documentElement.dataset.season = season;
    else delete document.documentElement.dataset.season;
  });
  // The accent follows the class you play (its emblem's colour, domain/meter.ts): the action colour, its fill dark
  // enough for a white label, and the tint and ink of the tags. Over the season's palette; off = the tokens as they are.
  const accent = $derived(s.classAccent ? classColor(ui.meter?.profile?.job ?? "") : "");
  $effect(() => {
    const root = document.documentElement.style;
    const set = { "--primary": accent, "--primary-fill": `color-mix(in srgb, ${accent} 55%, #000)`,
      "--magenta-bg": `color-mix(in srgb, ${accent} 28%, var(--ground))`, "--magenta-ink": `color-mix(in srgb, ${accent} 55%, #fff)` };
    for (const [k, v] of Object.entries(set)) if (accent) root.setProperty(k, v); else root.removeProperty(k);
  });
  // Once an hour is enough for what only the date changes (the trophies' count in the sidebar).
  const hour = $derived(Math.floor(ui.now / 3_600_000) * 3_600_000);
  const unread = $derived(ui.data.news.filter((n) => !n.read).length);
  const plan = $derived(activePlan(ui.data, ui.charId, ui.now));
  const bosses = $derived(bossBoard(ui.data.bosses, ui.now));
  const meter = $derived(ui.meter?.status);
  const METER_TEXT = { connected: "Aion 2 is running", searching: "Looking for the game", "waiting-game": "Waiting for the game", "no-capture": "Meter off: Npcap needed" } as const;
  // Sidebar groups: the open page's group is open; others only if the player opened them (remembered, this browser only).
  // The right column (wallet, timers) can be hidden for pages that want the width (remembered, this browser only).
  const WIDE_KEY = "aion2-wide";
  let wide = $state((() => { try { return localStorage.getItem(WIDE_KEY) === "1"; } catch { return false; } })());
  function toggleWide() {
    wide = !wide;
    try { localStorage.setItem(WIDE_KEY, wide ? "1" : "0"); } catch { /* not kept */ }
  }
  let palette = $state<Palette>();
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NAV_KEY = "aion2-nav-open";
  let navOpen = $state<Record<string, boolean>>((() => { try { return JSON.parse(localStorage.getItem(NAV_KEY) ?? "{}"); } catch { return {}; } })());
  const isOpen = (name: string, tabs: Tab[]) => tabs.includes(ui.tab) || navOpen[name] === true;
  function toggled(name: string, tabs: Tab[], e: Event) {
    const open = (e.currentTarget as HTMLDetailsElement).open;
    if (open === isOpen(name, tabs)) return; // set by the page change, not by the player
    navOpen[name] = open;
    try { localStorage.setItem(NAV_KEY, JSON.stringify(navOpen)); } catch { /* not kept */ }
  }

  // The character the game says you are playing: offered as a switch (or an add), never switched silently.
  let dismissed = $state("");
  const playing = $derived(ui.meter?.profile?.name ?? "");
  const detected = $derived(playing ? ui.data.characters.find((c) => sameName(c.name, playing)) : undefined);
  // The selected character's currencies and Odyle energy as last seen (src/domain/wallet.ts).
  const selName = $derived(ui.data.characters.find((c) => c.id === ui.charId)?.name ?? "");
  const picked = $derived(pickWallet(ui.data.wallets, selName, playing));
  const wallet = $derived(picked?.wallet);
  // Abyss Points gained since the daily reset, by where they came from (click the row).
  const apToday = $derived(wallet && wallet.values[930_100_003] != null ? apSince(wallet, lastBoundary("daily", ui.now, C)) : null);
  let apOpen = $state(false);
  // Sparklines: Abyss Points gained per day (the gains are kept 8 days), Kina at the end of each day (domain/history.ts).
  const apDays = $derived(wallet ? apByDay(wallet, hour) : []);
  const kinaDays = $derived((picked ? ui.data.history.kina[picked.name] : undefined)?.map((p) => p[1]) ?? []);
  const offer = $derived(playing && playing !== dismissed && detected?.id !== ui.charId ? playing : "");
  function switchTo() {
    if (detected) { ui.charId = detected.id; doneHere.clear(); }
    else act(() => { addCharacter(ui.data, playing); ui.charId = ui.data.characters.at(-1)!.id; doneHere.clear(); });
  }

  // A newer release (main.ts checks every 6 h): installing closes the app (and the meter), so it waits for the click.
  let updateHidden = $state("");
  async function install() {
    ui.updating = "Downloading the update…";
    try { await ui.update!.install(); } catch (e) { ui.updating = "Update failed: " + e; }
  }

  const suggested = $derived(ui.suggest && ui.data.tasks.find((t) => t.id === ui.suggest!.taskId));
  function learn(tr: Trigger) {
    const id = ui.suggest!.taskId;
    ui.suggest = null;
    act(() => addTrigger(ui.data, id, $state.snapshot(tr) as Trigger));
  }

  function badge(t: Tab) {
    if (t === "home" || t === "settings" || t === "news" || t === "dps" || t === "wiki" || t === "enhance" || t === "players" || t === "guild") return "";
    if (t === "trophies") { const n = tally(trophies(ui.data, ui.fights, ui.charId, hour)); return `${n.earned}/${n.total}`; }
    if (t === "map") return ui.data.map.points.length ? num(ui.data.map.points.length) : "";
    if (t === "pets") {
      // Pets at level 3, of those owned, for the character read last.
      const c = Object.values(ui.data.pets).sort((a, b) => b.atMs - a.atMs)[0];
      return c ? `${c.pets.filter((p) => p.level >= 3).length}/${c.pets.filter((p) => p.level > 0).length}` : "";
    }
    if (t === "bosses") { const up = ui.data.bosses.filter((b) => b.up).length; return up ? `${up} up` : ""; }
    if (t === "fights") return ui.fights.length ? num(ui.fights.length) : "";
    if (t === "crafting") return ui.data.crafting.targets.length ? num(ui.data.crafting.targets.length) : "";
    if (t === "arena") return ui.data.arena.matches.length ? num(ui.data.arena.matches.length) : "";
    if (t === "plan") return plan ? `${Math.ceil(planLeft(plan, ui.now))}m` : "";
    if (t === "season") {
      const left = seasonSummary(ui.data.season[ui.charId] ?? emptySeason(), 0).seasonalRemaining;
      return left >= 10_000 ? Math.round(left / 1000) + "k" : num(left);
    }
    const tasks = ui.data.tasks.filter((x) => x.enabled && x.cadence === t);
    return `${tasks.filter((x) => isDone(x, ui.data.progress[ui.charId]?.[x.id])).length}/${tasks.length}`;
  }
  function go(t: Tab) {
    ui.tab = t;
    history.replaceState(null, "", "#" + t);
  }
  // Ctrl+Z anywhere except inside a field (the field's own undo wins there).
  function keydown(e: KeyboardEvent) {
    const f = document.activeElement;
    // Expandable table rows (DPS, Fight Log, Arena): Enter or Space on a focused row is its click.
    if ((e.key === "Enter" || e.key === " ") && f instanceof HTMLTableRowElement && f.hasAttribute("aria-expanded")) {
      e.preventDefault();
      f.click();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !(f instanceof HTMLInputElement || f instanceof HTMLSelectElement)) {
      e.preventDefault();
      undo();
    }
  }
  // Hopex's birthday: 15 January, local time; the whole day counts as "today".
  const bday = $derived.by(() => {
    const n = new Date(ui.now), y = n.getFullYear();
    if (n.getMonth() === 0 && n.getDate() === 15) return "";
    return formatCountdown(new Date(n < new Date(y, 0, 15) ? y : y + 1, 0, 15).getTime() - ui.now);
  });
  // The song plays once when the countdown reaches zero with the app open (not on every start that day).
  let wasCounting = false;
  $effect(() => {
    if (bday) wasCounting = true;
    else if (wasCounting) { wasCounting = false; playBirthday(s.birthdayVolume); }
  });
  function cycle(c: (typeof CADENCES)[number]) {
    const next = nextBoundary(c, ui.now, C), last = lastBoundary(c, ui.now, C);
    return { left: next - ui.now, p: (ui.now - last) / (next - last) };
  }
</script>

<svelte:window onkeydown={keydown} onhashchange={() => { ui.tab = tabFromHash(); }} />

<div class="shell" class:no-inspector={wide}>
  <nav class="side" aria-label="Pages">
    <div class="brand" translate="no"><span class="logo">A2</span><b>AION 2</b><span>Companion</span></div>
    {@render tab("home")}
    {#each GROUPS as [name, tabs]}<details open={isOpen(name, tabs)} ontoggle={(e) => toggled(name, tabs, e)}><summary class="label"><ICON.chevron />{name}</summary>
      {#each tabs as t}{@render tab(t)}{/each}
    </details>{/each}
    {@render tab("wiki")}
    {@render tab("trophies")}
    <div class="side-foot">{@render tab("news")}{@render tab("settings")}</div>
  </nav>
  {#snippet tab(t: Tab)}{@const b = badge(t)}{@const I = ICON[t]}<button class="tab" title={PAGE[t][0]} aria-current={t === ui.tab ? "page" : undefined} onclick={() => go(t)}>
    <I /><span class="lbl">{PAGE[t][0]}</span>{#if t === "news"}{#if unread}<span class="badge">{unread}</span>{/if}{:else if b}<span class="count">{b}</span>{/if}</button>{/snippet}

  <main>
    <header class="topbar">
      <button class="search-btn" data-slot="search" title="Open a page, switch character or tick a task (Ctrl+K)" onclick={() => palette?.open()}>
        <ICON.search /><span>Go to a page, character or task…</span><kbd>Ctrl K</kbd></button>
      {#if meter}<span class="status-pill {meter}"><span class="dot"></span>{METER_TEXT[meter]}</span>{/if}
    </header>
    <div class="page-head"><h1>{PAGE[ui.tab][0]}</h1><p>{PAGE[ui.tab][1]}</p>
      <Button variant="ghost" size="icon-sm" class="side-toggle" aria-pressed={!wide} title={wide ? "Show the wallet and timers" : "Hide the wallet and timers: more room for the page"}
        aria-label="Wallet and timers column" onclick={toggleWide}><ICON.panel /></Button></div>
    {#if ui.update && ui.update.version !== updateHidden}<div class="banner update"><span class="grow">{#if ui.updating}{ui.updating}{:else}<b>AION 2 Companion {ui.update.version}</b> is ready.{/if}</span>
      <a class="whats-new" href="https://github.com/krajetum/AION2/releases/tag/v{ui.update.version}" target="_blank" rel="noopener">What's new</a>
      <Button size="sm" disabled={ui.updating.startsWith("Downloading") || ui.updating.startsWith("Updating")} onclick={install}>{gameActive(ui.now) ? "Install & restart (stops the meter)" : "Install & restart"}</Button>
      <Button variant="ghost" size="icon-sm" aria-label="Later" title="Later" onclick={() => { updateHidden = ui.update!.version; }}><ICON.close /></Button></div>{/if}
    <!-- The birthday strip: on Home while it counts down, on every page on the day. -->
    {#if ui.tab === "home" || !bday}<div class="bday"><img src={balloons} alt="" /><img src={cake} alt="" />
      <div class="grow"><b>Hopex's Birthday</b><span>{bday ? `in ${bday}` : "Happy birthday, Hopex!"}</span></div>
      <img src={gift} alt="" /><img src={confetti} alt="" /></div>{/if}
    {#if ui.suggest && suggested}<div class="banner info"><span class="grow">Tick <b>{suggested.name}</b> by itself next time you:</span>
      {#each ui.suggest.triggers as tr}<Button variant="outline" size="sm" onclick={() => learn(tr)}>{triggerLabel(tr, ui.data.arena.maps)}</Button>{/each}
      <Button variant="ghost" size="icon-sm" aria-label="Not now" title="Not now" onclick={() => { ui.suggest = null; }}><ICON.close /></Button></div>{/if}
    {#each ui.data.news.filter((n) => !n.read && isImportant(n)) as n (n.gid)}<div class="banner info"><a href={n.url} target="_blank" rel="noopener" onclick={() => markRead(n.gid)}>{n.title}</a>
      <Button variant="ghost" size="icon-sm" aria-label="Dismiss" title="Dismiss" onclick={() => markRead(n.gid)}><ICON.close /></Button></div>{/each}
    <!-- A page fades in when it opens (not with "reduce motion"). -->
    {#key ui.tab}<div in:fade={{ duration: still ? 0 : 120 }}>{#if ui.tab === "home"}<Home />{:else if ui.tab === "settings"}<Settings />{:else if ui.tab === "news"}<News />{:else if ui.tab === "season"}<Season />{:else if ui.tab === "crafting"}<Crafting />{:else if ui.tab === "enhance"}<Enhance />{:else if ui.tab === "dps"}<Dps />{:else if ui.tab === "fights"}<Fights />{:else if ui.tab === "arena"}<Arena />{:else if ui.tab === "players"}<Players />{:else if ui.tab === "guild"}<Guild />{:else if ui.tab === "bosses"}<Bosses />{:else if ui.tab === "map"}<MapPage />{:else if ui.tab === "pets"}<Pets />{:else if ui.tab === "plan"}<Planner />{:else if ui.tab === "wiki"}<Wiki />{:else if ui.tab === "trophies"}<Trophies />{:else}<TaskList cad={ui.tab} />{/if}</div>{/key}
  </main>

  <aside class="inspector" aria-label="Timers">
    <label class="char"><span class="label">Character</span><NativeSelect class="w-full" id="char" value={ui.charId} onchange={(e) => { ui.charId = e.currentTarget.value; doneHere.clear(); }}>
      {#each ui.data.characters as c (c.id)}<NativeSelectOption value={c.id}>{c.name}</NativeSelectOption>{/each}</NativeSelect></label>
    {#if offer}<span class="chip"><span class="grow">Playing <b>{offer}</b></span><Button variant="secondary" size="xs" onclick={switchTo}>{detected ? "Switch" : "Add"}</Button>
      <Button variant="ghost" size="icon-xs" aria-label="Dismiss" title="Dismiss" onclick={() => { dismissed = offer; }}><ICON.close /></Button></span>{/if}
    {#if s.mutedUntil > ui.now}<span class="chip">Muted until {hm(s.mutedUntil)}<Button variant="secondary" size="xs" onclick={() => act(() => unmute(ui.data))}>Unmute</Button></span>{/if}
    {#if wallet}<details open title="As the game last sent them{wallet.atMs ? ` (${hm(wallet.atMs)})` : ""}: currencies when you enter the world and whenever one changes, Odyle energy when the game sends it"><summary class="label"><ICON.chevron />Wallet{#if picked && !sameName(picked.name, selName)}<span class="wallet-of"> · {picked.name}</span>{/if}</summary>
      {#each walletRows(wallet, s.sumKina) as r ((picked?.name ?? "") + r.name)}<div class="timer event"><small>{r.name}</small>{#if r.name.startsWith("Kina")}<Spark values={kinaDays} label="Kina and bound Kina, the last {kinaDays.length} days" />{/if}<Amount value={r.value} /></div>{/each}
      {#if apToday}<button class="plain timer event ap-today" aria-expanded={apOpen} title="Abyss Points gained since the daily reset: click for where they came from"
        onclick={() => { apOpen = !apOpen; }}><small>AP today</small><Spark values={apDays} label="Abyss Points gained per day, the last 7 days" /><span>{num(apToday.total)}</span></button>
        {#if apOpen}<div class="ap-split">
          {#each [["In the Abyss", apToday.abyss], ["Elsewhere", apToday.elsewhere]] as [label, s] (label)}{@const t = (s as typeof apToday.abyss)}
            <div><b>{label}</b> <span>{num(t.players + t.mobs + t.other)}</span></div>
            <div class="sub"><small>Player kills / assists</small><span>{num(t.players)}</span></div>
            <div class="sub"><small>Mob kills</small><span>{num(t.mobs)}</span></div>
            <div class="sub"><small>Other</small><span>{num(t.other)}</span></div>{/each}
          <p class="hint">By timing: points within 5 s of a PvP kill or assist of yours, or of a mob you killed. Counted while the companion runs; the first change after it starts in game is "other".</p></div>{/if}{/if}
      {#if wallet.odyle}<div class="timer event" title="Basic · charged"><small>Odyle energy</small><span>{num(wallet.odyle.basic)} · {num(wallet.odyle.charged)}</span></div>{/if}
      {#if wallet.values[930_100_001] != null}<label class="toggle-line wallet-sum"><Checkbox checked={s.sumKina}
        onCheckedChange={(on) => act(() => { ui.data.settings.sumKina = on; })} /> Kina and bound Kina together</label>{/if}
    </details>{:else if meter}<details open><summary class="label"><ICON.chevron />Wallet</summary>
      <p class="hint wallet-hint">Your currencies come when you log in or change character in game, and whenever one changes.</p></details>{/if}
    <details open><summary class="label"><ICON.chevron />Resets</summary>
      {#each CADENCES as c}{@const cy = cycle(c)}<div class="timer" class:soon={cy.left < 3600_000} style:--p={String(cy.p)}><small>{LABEL[c]}</small><span>{formatCountdown(cy.left)}</span></div>{/each}
    </details>
    <details open><summary class="label"><ICON.chevron />Events</summary>
      {#each EVENTS as ev}<div class="timer event"><small>{ev.name}</small><span>{formatCountdown(nextEvent(ev, ui.now, C.timeZone) - ui.now)}</span></div>{/each}
    </details>
    {#if bosses.length}<details open title="From the maps you opened in game: open the map again to refresh"><summary class="label"><ICON.chevron />Field bosses</summary>
      {#each bosses as b (b.mapId + ":" + b.bossId)}<div class="timer event" class:up={b.up} class:soon={!b.up && b.timeMs - ui.now < 600_000}><small>{bossLabel(b, ui.data.bossNames)}</small>
        <span>{b.up ? `Up · seen ${hm(b.seenMs)}` : formatCountdown(b.timeMs - ui.now)}</span></div>{/each}
    </details>{/if}
  </aside>
</div>
{#if winter && s.snow}<Winter />{/if}
{#if s.celebrate}<Confetti />{/if}
<Mascot />
<Palette bind:this={palette} />
