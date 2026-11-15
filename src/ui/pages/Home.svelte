<script lang="ts">
  import { toggleBossAlert } from "../../app/bosses.ts";
  import { sortedTasks } from "../../app/tasks.ts";
  import { matchTotals } from "../../domain/arena.ts";
  import { bossLabel, bossState } from "../../domain/bosses.ts";
  import { clock, short } from "../../domain/meter.ts";
  import { emptySeason, seasonSummary } from "../../domain/season.ts";
  import { isDone } from "../../domain/tasks.ts";
  import { formatCountdown, lastBoundary } from "../../domain/time.ts";
  import { streak, strip } from "../../domain/history.ts";
  import { RESET_CONFIG as C } from "../../config.ts";
  import { CADENCES } from "../../domain/types.ts";
  import { act, markRead } from "../actions.ts";
  import { hm, LABEL, num } from "../format.ts";
  import { ICON } from "../icons.ts";
  import { winterActive } from "../../domain/holiday.ts";
  import AdventCalendar from "../parts/AdventCalendar.svelte";
  import Kpi from "../parts/Kpi.svelte";
  import { winterNow } from "../winter.ts";
  import TaskRow from "../parts/TaskRow.svelte";
  import { ui } from "../state.svelte.ts";

  const prog = $derived(ui.data.progress[ui.charId]);
  const cads = $derived(CADENCES.map((c) => {
    const all = sortedTasks(ui.data, c).filter((t) => t.enabled);
    return { c, all, left: all.filter((t) => !isDone(t, prog?.[t.id])) };
  }));
  const season = $derived(seasonSummary(ui.data.season[ui.charId] ?? emptySeason(), 0));
  // Bosses with a bell (Field Bosses page): up first, then the next respawns.
  const order = { up: 0, due: 1, passed: 2, unknown: 3 };
  const tracked = $derived(ui.data.bosses.filter((b) => ui.data.bossAlerts[b.bossId])
    .sort((a, b) => order[bossState(a, ui.now)] - order[bossState(b, ui.now)] || a.timeMs - b.timeMs));
  const match = $derived(ui.data.arena.matches[0]);
  // The streak strip: the last 35 daily cycles, newest first (domain/history.ts). The boundaries are found once
  // per cycle, not every second.
  const cycle = $derived(lastBoundary("daily", ui.now, C));
  const starts = $derived.by(() => {
    const out = [cycle];
    while (out.length < 35) out.push(lastBoundary("daily", out.at(-1)! - 1, C));
    return out;
  });
  const cells = $derived(strip(ui.data.history, ui.charId, starts, cads[0].all.length > 0 && !cads[0].left.length));
  const run = $derived(streak(cells));
  const dayLabel = (t: number) => new Date(t).toLocaleDateString([], { day: "numeric", month: "short" });
  const news = $derived(ui.data.news.slice(0, 4));
</script>

{#if ui.data.settings.winterTheme && winterActive(winterNow(ui.now))}<AdventCalendar />{/if}

<div class="kpis">
  {#each cads as x}<Kpi label={LABEL[x.c]} value="{x.all.length - x.left.length}/{x.all.length}" sub={x.left.length ? `${x.left.length} left` : "all done"} cls={x.c === "daily" ? "hero" : ""} />{/each}
  <Kpi label="Season coins left" value={num(season.seasonalRemaining)} sub="seasonal missions" />
</div>

<div class="home">
  <section class="dps-table"><h2>Tracked field bosses <span class="count"><a href="#bosses">All bosses</a></span></h2>
    {#if tracked.length}<div class="scroll"><table class="sheet"><tbody>{#each tracked as b (b.mapId + ":" + b.bossId)}{@const st = bossState(b, ui.now)}{@const a = ui.data.bossAlerts[b.bossId]}<tr class="boss {st}">
      <td><span class="name">{bossLabel(b, ui.data.bossNames)}</span><small>Map {b.mapId} · alert {a.leads.join(", ")} min before · {a.repeat ? "every respawn" : "once"}</small></td>
      <td>{#if st === "up"}<span class="pill teal">Up</span>{:else if st === "due"}<span class="pill neutral">Respawning</span>{:else if st === "passed"}<span class="pill">Should be up</span>{:else}<span class="pill neutral">No time</span>{/if}</td>
      <td class="n num">{st === "due" ? `${formatCountdown(b.timeMs - ui.now)} · ${hm(b.timeMs)}` : st === "unknown" ? "—" : `since ${hm(b.timeMs || b.seenMs)}`}</td>
      <td class="n"><button class="ghost bell on" aria-label="Remove alert for {b.name}" title="Remove alert" onclick={() => act(() => toggleBossAlert(ui.data, b.bossId))}>{@html ICON.bell}</button></td></tr>{/each}</tbody></table></div>
    {:else}<p class="hint">No boss tracked. Ring the bell on a boss in <a href="#bosses">Field Bosses</a> to see it here.</p>{/if}
  </section>

  <section><h2>Still to do today <span class="count"><a href="#daily">Daily list</a></span></h2>
    {#each cads[0].left.slice(0, 6) as t (t.id)}<TaskRow {t} />{:else}<p class="hint">Every daily task is done.</p>{/each}
    {#if cads[0].left.length > 6}<p class="hint">+{cads[0].left.length - 6} more in <a href="#daily">Daily</a></p>{/if}
  </section>

  <section><h2>Daily streak <span class="count">{run} day{run === 1 ? "" : "s"} in a row</span></h2>
    <div class="streak" role="img" aria-label="{cells.filter(Boolean).length} of the last {cells.length} days with every daily task done">
      {#each [...cells].reverse() as on, i}<i class:on class:today={i === cells.length - 1} title="{dayLabel(starts[cells.length - 1 - i])}{on ? ': every daily done' : ''}"></i>{/each}</div>
    <p class="hint">A square per day, the last five weeks, today last: filled when every daily task was done before the reset.</p>
  </section>

  <section><h2>Last arena match <span class="count"><a href="#arena">Arena log</a></span></h2>
    {#if match}{@const t = matchTotals(match)}<dl>
      <dt>Map</dt><dd>{ui.data.arena.maps[match.mapId] || `Map ${match.mapId}`} · {hm(match.startMs)}</dd>
      <dt>Time</dt><dd>{clock(t.ms)}</dd>
      <dt>Dealt / taken</dt><dd>{short(t.dealt)} / {short(t.taken)}</dd>
      <dt>Deaths</dt><dd>{t.ourDeaths} : {t.theirDeaths}</dd></dl>
    {:else}<p class="hint">No match logged yet.</p>{/if}
  </section>

  <section><h2>Latest news <span class="count"><a href="#news">All news</a></span></h2>
    {#each news as n (n.gid)}<article class="news-item {n.read ? '' : 'unread'}"><a href={n.url} target="_blank" rel="noopener" onclick={() => markRead(n.gid)}>{n.title}</a>
      <small>{new Date(n.date * 1000).toLocaleDateString([], { dateStyle: "medium" })}</small></article>{:else}<p class="hint">No news yet.</p>{/each}
  </section>
</div>

<style>
  .streak { display: flex; flex-wrap: wrap; gap: var(--s-1); margin-top: var(--s-2); }
  .streak i { width: 16px; height: 16px; border-radius: var(--r-sm); background: var(--raised); }
  .streak i.on { background: var(--teal); }
  .streak i.today { outline: 1px solid var(--accent); outline-offset: 1px; }
</style>
