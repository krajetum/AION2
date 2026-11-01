<script lang="ts">
  import { EVENTS, RESET_CONFIG as C } from "../config.ts";
  import { activePlan, planLeft } from "../app/planner.ts";
  import { seasonOf } from "../app/season.ts";
  import { addCharacter } from "../app/characters.ts";
  import { addTrigger } from "../app/tasks.ts";
  import { triggerLabel, type Trigger } from "../domain/triggers.ts";
  import { unmute } from "../app/settings.ts";
  import { gameActive } from "../app/crowd.ts";
  import { bossBoard, bossLabel } from "../domain/bosses.ts";
  import { sameName } from "../domain/meter.ts";
  import { apSince, pickWallet, walletRows } from "../domain/wallet.ts";
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
  import Enhance from "./pages/Enhance.svelte";
  import Settings from "./pages/Settings.svelte";
  import WikiDungeons from "./pages/WikiDungeons.svelte";
  import WikiMechanics from "./pages/WikiMechanics.svelte";
  import TaskList from "./pages/TaskList.svelte";
  import { sortedTasks } from "../app/tasks.ts";
  import { doneHere, GROUPS, tabFromHash, ui, type Tab } from "./state.svelte.ts";

  // Every character always has a season entry once shown (the save file has always had it).
  $effect.pre(() => { seasonOf(ui.data, ui.charId); });

  const s = $derived(ui.data.settings);
  const unread = $derived(ui.data.news.filter((n) => !n.read).length);
  const plan = $derived(activePlan(ui.data, ui.charId, ui.now));
  const bosses = $derived(bossBoard(ui.data.bosses, ui.now));
  const meter = $derived(ui.meter?.status);
  // Third sidebar level: the categories of the open task list.
  const cats = $derived(CADENCES.includes(ui.tab as never)
    ? [...new Set(sortedTasks(ui.data, ui.tab as (typeof CADENCES)[number]).filter((t) => t.enabled).map((t) => t.category))] : []);

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
  const offer = $derived(playing && playing !== dismissed && detected?.id !== ui.charId ? playing : "");
  function switchTo() {
    if (detected) { ui.charId = detected.id; doneHere.clear(); }
    else act(() => { addCharacter(ui.data, playing); ui.charId = ui.data.characters.at(-1)!.id; doneHere.clear(); });
  }

  // A newer release (main.ts checks every 6 h): installing closes the app (and the meter), so it waits for the click.
  let updateHidden = $state(""), updating = $state("");
  async function install() {
    updating = "Downloading the update…";
    try { await ui.update!.install(); } catch (e) { updating = "Update failed: " + e; }
  }

  const suggested = $derived(ui.suggest && ui.data.tasks.find((t) => t.id === ui.suggest!.taskId));
  function learn(tr: Trigger) {
    const id = ui.suggest!.taskId;
    ui.suggest = null;
    act(() => addTrigger(ui.data, id, $state.snapshot(tr) as Trigger));
  }

  function badge(t: Tab) {
    if (t === "home" || t === "settings" || t === "news" || t === "dps" || t === "expeditions" || t === "transcendence" || t === "mechanics" || t === "enhance" || t === "players") return "";
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

<div class="shell">
  <nav class="side" aria-label="Pages">
    <div class="brand" translate="no"><span class="logo">A2</span><b>AION 2</b><span>Companion</span></div>
    {#each GROUPS as [name, tabs]}<details open><summary class="label">{@html ICON.chevron}{name}</summary>
      {#each tabs as t}{@const b = badge(t)}<button class="tab" title={PAGE[t][0]} aria-current={t === ui.tab ? "page" : undefined} onclick={() => go(t)}>
        {@html ICON[t]}<span class="lbl">{PAGE[t][0]}</span>{#if t === "news"}{#if unread}<span class="badge">{unread}</span>{/if}{:else if b}<span class="count">{b}</span>{/if}</button>
        {#if t === ui.tab}{#each cats as c (c)}<button class="tab sub" onclick={() => document.getElementById("cat-" + c)?.scrollIntoView({ behavior: "smooth", block: "start" })}><span class="lbl">{c}</span></button>{/each}{/if}{/each}
    </details>{/each}
  </nav>

  <main>
    {#if ui.update && ui.update.version !== updateHidden}<div class="banner update"><span class="grow">{#if updating}{updating}{:else}<b>AION 2 Companion {ui.update.version}</b> is ready.{/if}</span>
      <a class="whats-new" href="https://github.com/krajetum/AION2/releases/tag/v{ui.update.version}" target="_blank" rel="noopener">What's new</a>
      <button disabled={updating.startsWith("Downloading")} onclick={install}>{gameActive(ui.now) ? "Install & restart (stops the meter)" : "Install & restart"}</button>
      <button class="ghost" aria-label="Later" title="Later" onclick={() => { updateHidden = ui.update!.version; }}>{@html ICON.close}</button></div>{/if}
    <div class="bday"><img src={balloons} alt="" /><img src={cake} alt="" />
      <div class="grow"><b>Hopex's Birthday</b><span>{bday ? `in ${bday}` : "Happy birthday, Hopex!"}</span></div>
      <img src={gift} alt="" /><img src={confetti} alt="" /></div>
    <div class="page-head"><h1>{PAGE[ui.tab][0]}</h1><p>{PAGE[ui.tab][1]}</p></div>
    {#if offer}<div class="banner"><span class="grow">Playing <b>{offer}</b> in game.</span>
      <button onclick={switchTo}>{detected ? "Switch" : "Add character"}</button>
      <button class="ghost" aria-label="Dismiss" title="Dismiss" onclick={() => { dismissed = offer; }}>{@html ICON.close}</button></div>{/if}
    {#if ui.suggest && suggested}<div class="banner info"><span class="grow">Tick <b>{suggested.name}</b> by itself next time you:</span>
      {#each ui.suggest.triggers as tr}<button onclick={() => learn(tr)}>{triggerLabel(tr, ui.data.arena.maps)}</button>{/each}
      <button class="ghost" aria-label="Not now" title="Not now" onclick={() => { ui.suggest = null; }}>{@html ICON.close}</button></div>{/if}
    {#each ui.data.news.filter((n) => !n.read && isImportant(n)) as n (n.gid)}<div class="banner info"><a href={n.url} target="_blank" rel="noopener" onclick={() => markRead(n.gid)}>{n.title}</a>
      <button class="ghost" aria-label="Dismiss" title="Dismiss" onclick={() => markRead(n.gid)}>{@html ICON.close}</button></div>{/each}
    {#if ui.tab === "home"}<Home />{:else if ui.tab === "settings"}<Settings />{:else if ui.tab === "news"}<News />{:else if ui.tab === "season"}<Season />{:else if ui.tab === "crafting"}<Crafting />{:else if ui.tab === "enhance"}<Enhance />{:else if ui.tab === "dps"}<Dps />{:else if ui.tab === "fights"}<Fights />{:else if ui.tab === "arena"}<Arena />{:else if ui.tab === "players"}<Players />{:else if ui.tab === "bosses"}<Bosses />{:else if ui.tab === "map"}<MapPage />{:else if ui.tab === "pets"}<Pets />{:else if ui.tab === "plan"}<Planner />{:else if ui.tab === "expeditions"}<WikiDungeons kind="expedition" />{:else if ui.tab === "transcendence"}<WikiDungeons kind="transcendence" />{:else if ui.tab === "mechanics"}<WikiMechanics />{:else}<TaskList cad={ui.tab} />{/if}
  </main>

  <aside class="inspector" aria-label="Timers">
    <label class="char"><span class="label">Character</span><select id="char" value={ui.charId} onchange={(e) => { ui.charId = e.currentTarget.value; doneHere.clear(); }}>
      {#each ui.data.characters as c (c.id)}<option value={c.id}>{c.name}</option>{/each}</select></label>
    {#if s.mutedUntil > ui.now}<span class="chip">Muted until {hm(s.mutedUntil)}<button onclick={() => act(() => unmute(ui.data))}>Unmute</button></span>{/if}
    {#if meter}<div class="meter-dot {meter}"><span class="dot"></span>Meter {meter === "connected" ? "connected" : meter === "searching" ? "searching" : meter === "waiting-game" ? "waiting for the game" : "no capture"}</div>{/if}
    {#if wallet}<details open title="As the game last sent them{wallet.atMs ? ` (${hm(wallet.atMs)})` : ""}: currencies when you enter the world and whenever one changes, Odyle energy when the game sends it"><summary class="label">{@html ICON.chevron}Wallet{#if picked && !sameName(picked.name, selName)}<span class="wallet-of"> · {picked.name}</span>{/if}</summary>
      {#each walletRows(wallet, s.sumKina) as r (r.name)}<div class="timer event"><small>{r.name}</small><span>{num(r.value)}</span></div>{/each}
      {#if apToday}<button class="timer event ap-today" aria-expanded={apOpen} title="Abyss Points gained since the daily reset: click for where they came from"
        onclick={() => { apOpen = !apOpen; }}><small>AP today</small><span>{num(apToday.total)}</span></button>
        {#if apOpen}<div class="ap-split">
          {#each [["In the Abyss", apToday.abyss], ["Elsewhere", apToday.elsewhere]] as [label, s] (label)}{@const t = (s as typeof apToday.abyss)}
            <div><b>{label}</b> <span>{num(t.players + t.mobs + t.other)}</span></div>
            <div class="sub"><small>Player kills / assists</small><span>{num(t.players)}</span></div>
            <div class="sub"><small>Mob kills</small><span>{num(t.mobs)}</span></div>
            <div class="sub"><small>Other</small><span>{num(t.other)}</span></div>{/each}
          <p class="hint">By timing: points within 5 s of a PvP kill or assist of yours, or of a mob you killed. Counted while the companion runs; the first change after it starts in game is "other".</p></div>{/if}{/if}
      {#if wallet.odyle}<div class="timer event" title="Basic · charged"><small>Odyle energy</small><span>{num(wallet.odyle.basic)} · {num(wallet.odyle.charged)}</span></div>{/if}
      {#if wallet.values[930_100_001] != null}<label class="toggle-line wallet-sum"><input type="checkbox" checked={s.sumKina}
        onchange={(e) => { const on = e.currentTarget.checked; act(() => { ui.data.settings.sumKina = on; }); }}> Kina and bound Kina together</label>{/if}
    </details>{:else if meter}<details open><summary class="label">{@html ICON.chevron}Wallet</summary>
      <p class="hint wallet-hint">Your currencies come when you log in or change character in game, and whenever one changes.</p></details>{/if}
    <details open><summary class="label">{@html ICON.chevron}Resets</summary>
      {#each CADENCES as c}{@const cy = cycle(c)}<div class="timer" class:soon={cy.left < 3600_000} style:--p={String(cy.p)}><small>{LABEL[c]}</small><span>{formatCountdown(cy.left)}</span></div>{/each}
    </details>
    <details open><summary class="label">{@html ICON.chevron}Events</summary>
      {#each EVENTS as ev}<div class="timer event"><small>{ev.name}</small><span>{formatCountdown(nextEvent(ev, ui.now, C.timeZone) - ui.now)}</span></div>{/each}
    </details>
    {#if bosses.length}<details open title="From the maps you opened in game: open the map again to refresh"><summary class="label">{@html ICON.chevron}Field bosses</summary>
      {#each bosses as b (b.mapId + ":" + b.bossId)}<div class="timer event" class:up={b.up} class:soon={!b.up && b.timeMs - ui.now < 600_000}><small>{bossLabel(b, ui.data.bossNames)}</small>
        <span>{b.up ? `Up · seen ${hm(b.seenMs)}` : formatCountdown(b.timeMs - ui.now)}</span></div>{/each}
    </details>{/if}
  </aside>
</div>
