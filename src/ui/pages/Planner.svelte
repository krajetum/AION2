<script lang="ts">
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

<div class="toolbar start plan-bar">
  {#each [20, 40, 60, 90] as m}<button class={!view.pl && view.s.planMinutes === m ? "primary" : ""} disabled={!!view.pl}
      onclick={() => act(() => { ui.data.settings.planMinutes = m; })}>{m} min</button>{/each}
  <label>Custom <input type="number" inputmode="numeric" min="5" max="600" step="5" value={view.s.planMinutes} disabled={!!view.pl} aria-label="Session minutes"
    onchange={(e) => commit(e, (v) => setPlanMinutes(ui.data, v), () => ui.data.settings.planMinutes)}> min</label>
  <label>Next session in <input type="number" inputmode="numeric" min="1" max="168" value={view.s.planNextHours} aria-label="Hours until the next session"
    onchange={(e) => commit(e, (v) => setPlanNextHours(ui.data, v), () => ui.data.settings.planNextHours)}> h</label>
  <UndoButton />
  {#if view.pl}<button onclick={() => act(() => stopPlan(ui.data))}>Stop session</button>{:else}<button class="primary" onclick={() => act(() => startPlan(ui.data, ui.charId, Date.now()))}>Start session</button>{/if}
</div>
<div class="kpis">
  <Kpi label={view.pl ? "Session left" : "Preview"} value={mins(view.left)} sub={view.pl ? `started ${hm(view.pl.start)} · learning your timings` : "start to learn your timings"} cls="hero" />
  <Kpi label="Planned" value="{planned}/{view.r.candidates}" sub="unfinished tasks" />
  <Kpi label="Ends around" value={hm(view.r.end)} sub={view.r.steps.some((x) => x.kind === "event") ? "events included" : "no events in the window"} />
  <Kpi label="Left out" value={String(view.r.skipped.length)}>{#if urgentOut}<span class="neg">{urgentOut} reset before next session</span>{:else}nothing urgent lost{/if}</Kpi>
</div>
{#if view.r.steps.length}<section><h2>Plan <span class="count">{view.r.steps.length} steps</span></h2>{#each view.r.steps as st (st.kind + st.id + st.start)}{#if st.kind === "event"}<div class="step event"><time>{hm(st.start)}</time><div class="task"><span class="text">
      <span class="name">{st.name}</span><small class="plan-hint">Event · {mins(st.minutes)} reserved</small></span></div></div>{:else}<div class="step {st.urgent ? 'urgent' : ''}"><time>{hm(st.start)}</time><TaskRow t={findTask(ui.data, st.id)} hint={hint(st)} /></div>{/if}{/each}</section>
{:else if view.r.candidates}<p class="empty">Nothing fits in {mins(view.left)}.</p>
{:else}<section class="win"><div><h2>Nothing left to plan</h2><p>Every task is done.</p></div></section>{/if}
{#if done.length}<section><h2>Done just now <span class="count">ticked in your Daily / Weekly / Monthly lists too</span></h2>{#each done as id (id)}<TaskRow t={findTask(ui.data, id)} />{/each}</section>{/if}
{#if view.r.skipped.length}<section><h2>Doesn't fit <span class="count">{view.r.skipped.length}</span></h2>{#each view.r.skipped as x}<div class="task"><span class="text"><span class="name">{x.name}</span>
      <small>{mins(x.minutes)}{#if x.urgent}{" · "}<span class="neg">resets before your next session</span>{/if}</small></span></div>{/each}</section>{/if}
{#if estimates.length}<section><h2>Estimates <span class="count">minutes for the whole task</span></h2><div class="scroll"><table class="sheet">
      <thead><tr><th>Cadence</th><th>Task</th><th class="n">Minutes</th><th class="c">Priority</th></tr></thead>
      <tbody>{#each estimates as t (t.id)}<tr><td class="dim">{LABEL[t.cadence]}</td><td><span class="name">{t.name}</span></td>
        <td class="n"><input type="number" inputmode="decimal" min="0.5" max="600" step="0.5" value={t.minutes ?? DEFAULT_MINUTES} aria-label="{t.name} minutes"
          onchange={(e) => commit(e, (v) => setTaskMinutes(ui.data, t.id, v), () => t.minutes ?? DEFAULT_MINUTES)}></td>
        <td class="c"><select value={String(t.priority ?? DEFAULT_PRIORITY)} aria-label="{t.name} priority"
          onchange={(e) => commit(e, (v) => setTaskPriority(ui.data, t.id, v), () => t.priority ?? DEFAULT_PRIORITY)}>{#each PRIO as l, i}<option value={String(i + 1)}>{l}</option>{/each}</select></td></tr>{/each}</tbody></table></div>
    <p class="hint">During a session, the time between two ticks updates the estimate. Events count only if their alert is on in Settings.</p></section>{/if}
