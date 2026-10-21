<script lang="ts">
  import { EVENTS, RESET_CONFIG as C } from "../config.ts";
  import { activePlan, planLeft } from "../app/planner.ts";
  import { seasonOf } from "../app/season.ts";
  import { addCharacter } from "../app/characters.ts";
  import { unmute } from "../app/settings.ts";
  import { bossBoard } from "../domain/bosses.ts";
  import { sameName } from "../domain/meter.ts";
  import { isImportant } from "../domain/news.ts";
  import { emptySeason, seasonSummary } from "../domain/season.ts";
  import { isDone } from "../domain/tasks.ts";
  import { formatCountdown, lastBoundary, nextBoundary, nextEvent } from "../domain/time.ts";
  import { CADENCES } from "../domain/types.ts";
  import { act, markRead, undo } from "./actions.ts";
  import { hm, LABEL, num, PAGE } from "./format.ts";
  import { ICON } from "./icons.ts";
  import { MEME } from "./memes.ts";
  import Arena from "./pages/Arena.svelte";
  import Bosses from "./pages/Bosses.svelte";
  import Dps from "./pages/Dps.svelte";
  import News from "./pages/News.svelte";
  import Planner from "./pages/Planner.svelte";
  import Season from "./pages/Season.svelte";
  import Settings from "./pages/Settings.svelte";
  import TaskList from "./pages/TaskList.svelte";
  import Meme from "./parts/Meme.svelte";
  import { doneHere, TABS, tabFromHash, ui, type Tab } from "./state.svelte.ts";

  // Every character always has a season entry once shown (the save file has always had it).
  $effect.pre(() => { seasonOf(ui.data, ui.charId); });

  const s = $derived(ui.data.settings);
  const unread = $derived(ui.data.news.filter((n) => !n.read).length);
  const plan = $derived(activePlan(ui.data, ui.charId, ui.now));
  const bosses = $derived(bossBoard(ui.data.bosses, ui.now));

  // The character the game says you are playing: offered as a switch (or an add), never switched silently.
  let dismissed = $state("");
  const playing = $derived(ui.meter?.profile?.name ?? "");
  const detected = $derived(playing ? ui.data.characters.find((c) => sameName(c.name, playing)) : undefined);
  const offer = $derived(playing && playing !== dismissed && detected?.id !== ui.charId ? playing : "");
  function switchTo() {
    if (detected) { ui.charId = detected.id; doneHere.clear(); }
    else act(() => { addCharacter(ui.data, playing); ui.charId = ui.data.characters.at(-1)!.id; doneHere.clear(); });
  }

  function badge(t: Tab) {
    if (t === "settings" || t === "news" || t === "dps") return "";
    if (t === "bosses") { const up = ui.data.bosses.filter((b) => b.up).length; return up ? `${up} up` : ""; }
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
  function cycle(c: (typeof CADENCES)[number]) {
    const next = nextBoundary(c, ui.now, C), last = lastBoundary(c, ui.now, C);
    return { left: next - ui.now, p: (ui.now - last) / (next - last) };
  }
</script>

<svelte:window onkeydown={keydown} onhashchange={() => { ui.tab = tabFromHash(); }} />

<header>
  {#if s.memeMascot && MEME.mascot}<button class="mascot" aria-label="Hide mascot" title="Click to hide" onclick={() => act(() => { s.memeMascot = false; })}><Meme src={MEME.mascot} w={80} h={44} /></button>{/if}
  <div class="brand" translate="no"><b>AION 2</b><span>Companion™</span><small>no bots, I swear</small></div>
  {#if s.mutedUntil > ui.now}<span class="chip">Shhh until {hm(s.mutedUntil)}
      <button onclick={() => act(() => unmute(ui.data))}>Unshhh</button></span>{/if}
  <label class="char">Character <select id="char" value={ui.charId} onchange={(e) => { ui.charId = e.currentTarget.value; doneHere.clear(); }}>
    {#each ui.data.characters as c (c.id)}<option value={c.id}>{c.name}</option>{/each}</select></label>
</header>
<div class="timers">
  {#each CADENCES as c}{@const cy = cycle(c)}<div class="timer" class:soon={cy.left < 3600_000} style:--p={String(cy.p)}><small>{LABEL[c]} copium refill</small><span>{formatCountdown(cy.left)}</span></div>{/each}
  {#each EVENTS as ev}<div class="timer event"><small>{ev.name}</small><span>{formatCountdown(nextEvent(ev, ui.now, C.timeZone) - ui.now)}</span></div>{/each}
</div>
{#if bosses.length}<div class="timers bosses" title="From the maps you opened in game: open the map again to refresh">
  {#each bosses as b (b.mapId + ":" + b.bossId)}<div class="timer event" class:soon={!b.up && b.timeMs - ui.now < 600_000}><small>{b.name}</small>
    <span>{b.up ? `Up · seen ${hm(b.seenMs)}` : formatCountdown(b.timeMs - ui.now)}</span></div>{/each}
</div>{/if}
{#if offer}<div class="banner"><span class="grow">Playing <b>{offer}</b> in game.</span>
  <button onclick={switchTo}>{detected ? "Switch" : "Add character"}</button>
  <button class="ghost" aria-label="Dismiss" title="Dismiss" onclick={() => { dismissed = offer; }}>{@html ICON.close}</button></div>{/if}
{#each ui.data.news.filter((n) => !n.read && isImportant(n)) as n (n.gid)}<div class="banner"><a href={n.url} target="_blank" rel="noopener" onclick={() => markRead(n.gid)}>{n.title}</a>
    <button class="ghost" aria-label="Dismiss" title="Dismiss" onclick={() => markRead(n.gid)}>{@html ICON.close}</button></div>{/each}
<div class="layout">
  <main>
    <div class="page-head"><h1>{PAGE[ui.tab][0]}</h1><p>{PAGE[ui.tab][1]}</p></div>
    {#if ui.tab === "settings"}<Settings />{:else if ui.tab === "news"}<News />{:else if ui.tab === "season"}<Season />{:else if ui.tab === "dps"}<Dps />{:else if ui.tab === "arena"}<Arena />{:else if ui.tab === "bosses"}<Bosses />{:else if ui.tab === "plan"}<Planner />{:else}<TaskList cad={ui.tab} />{/if}</main>
  <nav class="side" aria-label="Pages">{#each TABS as t}{@const b = badge(t)}<button class="tab" title={PAGE[t][0]} aria-current={t === ui.tab ? "page" : undefined} onclick={() => go(t)}>
      {@html ICON[t]}<span class="lbl">{PAGE[t][0]}</span>{#if t === "news"}{#if unread}<span class="badge">{unread}</span>{/if}{:else if b}<span class="count">{b}</span>{/if}</button>{/each}</nav>
</div>
