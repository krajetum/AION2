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
  import Codes from "../parts/Codes.svelte";
  import Kpi from "../parts/Kpi.svelte";
  import { winterNow } from "../winter.ts";
  import TaskRow from "../parts/TaskRow.svelte";
  import { ui } from "../state.svelte.ts";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  const BOSS_TEXT = { up: "Up", due: "Respawning", passed: "Should be up", unknown: "No time" } as const;
  const BOSS_TONE = { up: "text-hps", due: "", passed: "text-gold", unknown: "text-muted-foreground" } as const;

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

<div class="mb-3 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
  {#each cads as x}<Kpi label={LABEL[x.c]} value="{x.all.length - x.left.length}/{x.all.length}" sub={x.left.length ? `${x.left.length} left` : "all done"} cls={x.c === "daily" ? "hero" : ""} />{/each}
  <Kpi label="Season coins left" value={num(season.seasonalRemaining)} sub="seasonal missions" />
</div>

<div class="grid grid-cols-[repeat(auto-fit,minmax(380px,1fr))] items-start gap-x-3">
  <Codes />

  <Panel title="Tracked field bosses">{#snippet actions()}<a class="text-primary hover:underline" href="#bosses">All bosses</a>{/snippet}
    {#if tracked.length}<Table.Root><Table.Body>{#each tracked as b (b.mapId + ":" + b.bossId)}{@const st = bossState(b, ui.now)}{@const a = ui.data.bossAlerts[b.bossId]}<Table.Row>
      <Table.Cell class="whitespace-normal"><div class="font-medium {st === 'unknown' ? 'text-muted-foreground' : ''}">{bossLabel(b, ui.data.bossNames)}</div>
        <div class="text-xs text-muted-foreground">Map {b.mapId} · alert {a.leads.join(", ")} min before · {a.repeat ? "every respawn" : "once"}</div></Table.Cell>
      <Table.Cell><Badge variant="secondary" class={BOSS_TONE[st]}>{BOSS_TEXT[st]}</Badge></Table.Cell>
      <Table.Cell class="text-right">{st === "due" ? `${formatCountdown(b.timeMs - ui.now)} · ${hm(b.timeMs)}` : st === "unknown" ? "—" : `since ${hm(b.timeMs || b.seenMs)}`}</Table.Cell>
      <Table.Cell class="w-10 text-right"><Button variant="ghost" size="icon-sm" class="text-gold" aria-label="Remove alert for {b.name}" title="Remove alert" onclick={() => act(() => toggleBossAlert(ui.data, b.bossId))}><ICON.bell /></Button></Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
    {:else}<p class="hint">No boss tracked. Ring the bell on a boss in <a class="underline" href="#bosses">Field Bosses</a> to see it here.</p>{/if}
  </Panel>

  <Panel title="Still to do today">{#snippet actions()}<a class="text-primary hover:underline" href="#daily">Daily list</a>{/snippet}
    {#each cads[0].left.slice(0, 6) as t (t.id)}<TaskRow {t} />{:else}<p class="hint">Every daily task is done.</p>{/each}
    {#if cads[0].left.length > 6}<p class="hint">+{cads[0].left.length - 6} more in <a class="underline" href="#daily">Daily</a></p>{/if}
  </Panel>

  <Panel title="Daily streak">{#snippet actions()}<span class="text-xs text-muted-foreground">{run} day{run === 1 ? "" : "s"} in a row</span>{/snippet}
    <div class="flex flex-wrap gap-1" role="img" aria-label="{cells.filter(Boolean).length} of the last {cells.length} days with every daily task done">
      {#each [...cells].reverse() as on, i}<i class="size-4 rounded-sm {on ? 'bg-hps' : 'bg-secondary'} {i === cells.length - 1 ? 'outline outline-offset-1 outline-gold' : ''}"
        title="{dayLabel(starts[cells.length - 1 - i])}{on ? ': every daily done' : ''}"></i>{/each}</div>
    <p class="hint">A square per day, the last five weeks, today last: filled when every daily task was done before the reset.</p>
  </Panel>

  <Panel title="Last arena match">{#snippet actions()}<a class="text-primary hover:underline" href="#arena">Arena log</a>{/snippet}
    {#if match}{@const t = matchTotals(match)}<dl class="text-sm">
      <dt>Map</dt><dd>{ui.data.arena.maps[match.mapId] || `Map ${match.mapId}`} · {hm(match.startMs)}</dd>
      <dt>Time</dt><dd>{clock(t.ms)}</dd>
      <dt>Dealt / taken</dt><dd>{short(t.dealt)} / {short(t.taken)}</dd>
      <dt>Deaths</dt><dd>{t.ourDeaths} : {t.theirDeaths}</dd></dl>
    {:else}<p class="hint">No match logged yet.</p>{/if}
  </Panel>

  <Panel title="Latest news">{#snippet actions()}<a class="text-primary hover:underline" href="#news">All news</a>{/snippet}
    {#each news as n (n.gid)}<article class="border-b py-2 last:border-0"><a class="font-medium hover:underline {n.read ? 'text-muted-foreground' : ''}" href={n.url} target="_blank" rel="noopener" onclick={() => markRead(n.gid)}>{#if !n.read}<span class="mr-2 inline-block size-1.5 rounded-full bg-primary align-middle"></span>{/if}{n.title}</a>
      <div class="text-xs text-muted-foreground">{new Date(n.date * 1000).toLocaleDateString([], { dateStyle: "medium" })}</div></article>{:else}<p class="hint">No news yet.</p>{/each}
  </Panel>
</div>
