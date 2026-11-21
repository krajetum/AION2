<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { NativeSelect, NativeSelectOption } from "$lib/components/ui/native-select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  import Empty from "../parts/Empty.svelte";
  import { EVENTS, RESET_CONFIG as C } from "../../config.ts";
  import { activePlan, planLeft, startPlan, stopPlan } from "../../app/planner.ts";
  import { setPlanMinutes, setPlanNextHours } from "../../app/settings.ts";
  import { findTask, setTaskMinutes, setTaskPriority } from "../../app/tasks.ts";
  import { DEFAULT_MINUTES, DEFAULT_PRIORITY, leftShare, plan, type Step } from "../../domain/planner.ts";
  import { isDone } from "../../domain/tasks.ts";
  import { CADENCES, type Task } from "../../domain/types.ts";
  import { act, commit } from "../actions.ts";
  import { hm, LABEL, mins, PRIO } from "../format.ts";
  import Kpi from "../parts/Kpi.svelte";
  import TaskRow from "../parts/TaskRow.svelte";
  import UndoButton from "../parts/UndoButton.svelte";
  import { doneHere, ui } from "../state.svelte.ts";

  // Planner times move with the clock: recomputed every minute and on every change.
  const minute = $derived(Math.floor(ui.now / 60_000));
  const view = $derived.by(() => {
    void minute;
    const s = ui.data.settings, now = Date.now(), pl = activePlan(ui.data, ui.charId, now);
    const r = plan({
      tasks: ui.data.tasks, progress: ui.data.progress[ui.charId] ?? {},
      events: EVENTS.filter((ev) => s.channels[ev.id]?.on), // events you get alerts for = events you play
      now, minutes: pl ? planLeft(pl, now) : s.planMinutes, nextSessionHours: s.planNextHours, config: C,
    });
    return { s, now, pl, r, left: pl ? planLeft(pl, now) : s.planMinutes };
  });
  const prog = $derived(ui.data.progress[ui.charId]);
  const urgentOut = $derived(view.r.skipped.filter((x) => x.urgent).length);
  const planned = $derived(new Set(view.r.steps.filter((x) => x.kind === "task").map((x) => x.id)).size);
  const done = $derived([...doneHere].filter((id) => isDone(findTask(ui.data, id), prog?.[id])));
  const estimates = $derived(ui.data.tasks.filter((t) => t.enabled && leftShare(t, prog?.[t.id]) > 0)
    .sort((a, b) => CADENCES.indexOf(a.cadence) - CADENCES.indexOf(b.cadence) || a.order - b.order));

  /** "Wins +4 · Entries +2" for a step that does only part of a goal task. */
  function stepUnits(t: Task, st: Step) {
    const p = prog?.[t.id];
    const units = (t.goals ?? []).map((g, i) => {
      const left = Math.max(0, g.target - (p?.counts?.[i] ?? 0));
      return { g, left, n: Math.min(left, Math.ceil((st.part ?? 1) * g.target)) };
    });
    if (units.every((u) => u.n >= u.left)) return "";
    return units.filter((u) => u.n).map((u) => `${u.g.label ?? ""} +${u.n}`.trim()).join(" · ");
  }
  function hint(st: Step) {
    const units = stepUnits(findTask(ui.data, st.id), st);
    return [`~${mins(st.minutes)}`, units && `do ${units}, rest later`, st.urgent && "resets before your next session"].filter(Boolean).join(" · ");
  }
</script>

<div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
  {#each [20, 40, 60, 90] as m}<Button size="sm" variant={!view.pl && view.s.planMinutes === m ? "default" : "outline"} disabled={!!view.pl}
      onclick={() => act(() => { ui.data.settings.planMinutes = m; })}>{m} min</Button>{/each}
  <label class="flex items-center gap-1.5 text-muted-foreground">Custom <Input class="h-7 w-18" type="number" inputmode="numeric" min="5" max="600" step="5" value={view.s.planMinutes} disabled={!!view.pl} aria-label="Session minutes"
    onchange={(e) => commit(e, (v) => setPlanMinutes(ui.data, v), () => ui.data.settings.planMinutes)} /> min</label>
  <label class="flex items-center gap-1.5 text-muted-foreground">Next session in <Input class="h-7 w-18" type="number" inputmode="numeric" min="1" max="168" value={view.s.planNextHours} aria-label="Hours until the next session"
    onchange={(e) => commit(e, (v) => setPlanNextHours(ui.data, v), () => ui.data.settings.planNextHours)} /> h</label>
  <span class="grow"></span><UndoButton />
  {#if view.pl}<Button size="sm" variant="outline" onclick={() => act(() => stopPlan(ui.data))}>Stop session</Button>{:else}<Button size="sm" onclick={() => act(() => startPlan(ui.data, ui.charId, Date.now()))}>Start session</Button>{/if}
</div>
<div class="mb-3 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
  <Kpi label={view.pl ? "Session left" : "Preview"} value={mins(view.left)} sub={view.pl ? `started ${hm(view.pl.start)} · learning your timings` : "start to learn your timings"} cls="hero" />
  <Kpi label="Planned" value="{planned}/{view.r.candidates}" sub="unfinished tasks" />
  <Kpi label="Ends around" value={hm(view.r.end)} sub={view.r.steps.some((x) => x.kind === "event") ? "events included" : "no events in the window"} />
  <Kpi label="Left out" value={String(view.r.skipped.length)}>{#if urgentOut}<span class="text-taken">{urgentOut} reset before next session</span>{:else}nothing urgent lost{/if}</Kpi>
</div>
{#if view.r.steps.length}<Panel title="Plan" count="{view.r.steps.length} steps">{#each view.r.steps as st (st.kind + st.id + st.start)}<div class="grid grid-cols-[52px_1fr] items-start gap-x-3 border-b last:border-0 [&>div]:border-0">
    <time class="pt-3 tabular-nums {st.kind !== 'event' && st.urgent ? 'text-gold' : 'text-muted-foreground'}">{hm(st.start)}</time>
    {#if st.kind === "event"}<div class="flex flex-col py-2.5"><span class="font-medium text-muted-foreground">{st.name}</span><small class="text-xs text-muted-foreground">Event · {mins(st.minutes)} reserved</small></div>
    {:else}<TaskRow t={findTask(ui.data, st.id)} hint={hint(st)} />{/if}</div>{/each}</Panel>
{:else if view.r.candidates}<Empty>Nothing fits in {mins(view.left)}.</Empty>
{:else}<Card.Root class="mb-3 border-hps/30 bg-hps/10 px-4 py-3"><h2 class="m-0 text-base font-semibold text-hps">Nothing left to plan</h2><p class="m-0 text-sm text-muted-foreground">Every task is done.</p></Card.Root>{/if}
{#if done.length}<Panel title="Done just now" count="ticked in your Daily / Weekly / Monthly lists too">{#each done as id (id)}<TaskRow t={findTask(ui.data, id)} />{/each}</Panel>{/if}
{#if view.r.skipped.length}<Panel title="Doesn't fit" count={view.r.skipped.length}>{#each view.r.skipped as x}<div class="flex flex-col border-b py-2.5 last:border-0"><span class="font-medium">{x.name}</span>
      <small class="text-xs text-muted-foreground">{mins(x.minutes)}{#if x.urgent}{" · "}<span class="text-taken">resets before your next session</span>{/if}</small></div>{/each}</Panel>{/if}
{#if estimates.length}<Panel title="Estimates" count="minutes for the whole task"><Table.Root>
      <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Cadence</Table.Head><Table.Head>Task</Table.Head><Table.Head class="text-right">Minutes</Table.Head><Table.Head class="text-center">Priority</Table.Head></Table.Row></Table.Header>
      <Table.Body>{#each estimates as t (t.id)}<Table.Row><Table.Cell class="text-muted-foreground">{LABEL[t.cadence]}</Table.Cell><Table.Cell class="font-medium">{t.name}</Table.Cell>
        <Table.Cell class="text-right"><Input class="ml-auto h-7 w-20" type="number" inputmode="decimal" min="0.5" max="600" step="0.5" value={t.minutes ?? DEFAULT_MINUTES} aria-label="{t.name} minutes"
          onchange={(e) => commit(e, (v) => setTaskMinutes(ui.data, t.id, v), () => t.minutes ?? DEFAULT_MINUTES)} /></Table.Cell>
        <Table.Cell class="text-center"><NativeSelect size="sm" class="mx-auto" value={String(t.priority ?? DEFAULT_PRIORITY)} aria-label="{t.name} priority"
          onchange={(e) => commit(e, (v) => setTaskPriority(ui.data, t.id, v), () => t.priority ?? DEFAULT_PRIORITY)}>{#each PRIO as l, i}<NativeSelectOption value={String(i + 1)}>{l}</NativeSelectOption>{/each}</NativeSelect></Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
    <p class="hint">During a session, the time between two ticks updates the estimate. Events count only if their alert is on in Settings.</p></Panel>{/if}
