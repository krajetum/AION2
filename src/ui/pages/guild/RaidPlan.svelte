<script lang="ts">
  // Raid plan: each member paints the hours they are free (every week, or only one week); with view.raidsummary,
  // everyone's hours added up: how many are free each hour, who, which classes, and each day's best stretch.
  import { getAvailability, saveAvailability } from "../../../app/guild.ts";
  import { can, type GuildLink, type GuildView } from "../../../domain/guild.ts";
  import {
    addWeeks, bestDays, blockOf, classesOf, DAY_NAMES, DAYS, emptyWeek, freeBySlot, hourLabel, hoursFor, ownWeek, setDay, setRange,
    slotNow, slotOf, slotStart, weekOf, type Availability, type MemberAvailability, type Week,
  } from "../../../domain/raidplan.ts";
  import { RAID_PLAN } from "../../../config.ts";
  import { ui } from "../../state.svelte.ts";
  import { gs, run, say } from "./run.svelte.ts";

  let { g, view }: { g: GuildLink; view: GuildView } = $props();
  const summary = $derived(can(view, g, "view.raidsummary"));

  // ---- What the Worker has ----
  let mine = $state<Availability | null>(null);
  let members = $state<MemberAvailability[] | null>(null);
  let loaded = $state(false), loadError = $state("");
  async function load() {
    try {
      const r = await getAvailability(ui.data);
      mine = r.mine; members = r.members; loadError = "";
    } catch (e) { loadError = say(e); }
    loaded = true;
  }
  $effect(() => { void load(); });

  // ---- The week shown: this one or the next (server time) ----
  const thisWeek = $derived(weekOf(ui.now));
  let offset = $state(0);
  const week = $derived(addWeeks(thisWeek, offset));
  const dateOf = (day: number) => new Date(Date.parse(week + "T12:00:00Z") + day * 86_400_000);
  const shortDate = (d: Date) => d.toLocaleDateString([], { day: "numeric", month: "short", timeZone: "UTC" });
  const weekLabel = (w: string) => `${shortDate(new Date(Date.parse(w + "T12:00:00Z")))} – ${shortDate(new Date(Date.parse(w + "T12:00:00Z") + 6 * 86_400_000))}`;
  const nowSlot = $derived(slotNow(week, ui.now));
  /** The plan's zone in the reader's words, e.g. "CET" (the grid is the same for the whole guild). */
  const zoneName = $derived(new Intl.DateTimeFormat([], { timeZone: RAID_PLAN.timeZone, timeZoneName: "short" }).formatToParts(slotStart(week, 84)).find((p) => p.type === "timeZoneName")?.value ?? RAID_PLAN.timeZone);
  /** Thursday 12:00 server time isn't 12:00 on this PC: say so. */
  const localDiffers = $derived(new Date(slotStart(week, slotOf(3, 12))).getHours() !== 12);

  // ---- My hours: a draft of the week shown, saved for every week or this week only ----
  let tab = $state<"mine" | "guild">("mine");
  let scope = $state<"every" | "week">("every");
  let draft = $state<Week>(emptyWeek());
  let dirty = $state(false);
  const own = $derived(ownWeek(mine, week));
  /** Start from what counts for the week shown; "only this week" is picked when it has its own hours. */
  function reset() {
    scope = own ? "week" : "every";
    draft = hoursFor(mine, week);
    dirty = false;
  }
  $effect(() => { void week; void mine; reset(); });
  const change = (w: Week) => { draft = w; dirty = true; };

  // Painting: press on an hour, drag over others: they all take the first one's new value.
  let painting = $state<boolean | null>(null);
  function paintStart(slot: number, e: PointerEvent) {
    if (blockOf(slot) || e.button !== 0) return;
    painting = !draft[slot];
    paint(slot);
  }
  function paint(slot: number) {
    if (painting === null || blockOf(slot) || draft[slot] === painting) return;
    const w = [...draft]; w[slot] = painting; change(w);
  }

  /** Keyboard: Enter or Space flips the hour (the pointer paints instead). */
  function toggleKey(slot: number, e: KeyboardEvent) {
    if ((e.key !== "Enter" && e.key !== " ") || blockOf(slot)) return;
    e.preventDefault();
    const w = [...draft]; w[slot] = !w[slot]; change(w);
  }

  // A range typed in: "Friday from 18 to 23, free".
  let rDay = $state(0), rFrom = $state(18), rTo = $state(23), rFree = $state(true);
  const applyRange = () => change(setRange(draft, rDay, rFrom, rTo, rFree));
  const dayFull = (day: number) => [...Array(24).keys()].every((h) => draft[slotOf(day, h)] || blockOf(slotOf(day, h)));

  const save = () => run(async () => {
    if (scope === "every") await saveAvailability(ui.data, { slots: draft, ...(own ? { week: { start: week, slots: null } } : {}) });
    else await saveAvailability(ui.data, { week: { start: week, slots: draft } });
    await load();
  }, scope === "every" ? "Saved for every week" : `Saved for the week of ${weekLabel(week)}`);
  const backToEvery = () => run(async () => {
    await saveAvailability(ui.data, { week: { start: week, slots: null } });
    await load();
  }, "This week follows your usual hours again");
  const hoursCount = $derived(draft.filter(Boolean).length);

  // ---- Everyone ----
  const bySlot = $derived(members ? freeBySlot(members, week) : []);
  const most = $derived(Math.max(1, ...bySlot.map((w) => w.length)));
  const days = $derived(members ? bestDays(members, week) : []);
  let picked = $state<number | null>(null);
  const pickedWho = $derived(picked === null ? [] : bySlot[picked] ?? []);
  const notMarked = $derived(Math.max(0, view.memberCount - (members?.length ?? 0)));
  const range = (d: { day: number; from: number; to: number }) => `${DAY_NAMES[d.day]} ${dateOf(d.day).getUTCDate()}, ${hourLabel(d.from)}–${hourLabel(d.to)}`;
</script>

<section>
  <div class="head">
    <h2>Raid plan</h2>
    <div class="seg" role="group" aria-label="Week">
      <button class:on={offset === 0} aria-pressed={offset === 0} onclick={() => { offset = 0; picked = null; }}>This week <small>{weekLabel(thisWeek)}</small></button>
      <button class:on={offset === 1} aria-pressed={offset === 1} onclick={() => { offset = 1; picked = null; }}>Next week <small>{weekLabel(addWeeks(thisWeek, 1))}</small></button>
    </div>
    {#if summary}<div class="seg" role="group" aria-label="View">
      <button class:on={tab === "mine"} aria-pressed={tab === "mine"} onclick={() => (tab = "mine")}>My hours</button>
      <button class:on={tab === "guild"} aria-pressed={tab === "guild"} onclick={() => (tab = "guild")}>Everyone</button>
    </div>{/if}
  </div>
  <p class="hint">Times are server time ({zoneName}){localDiffers ? ", which may differ from your clock" : ""}. Hatched hours are
    blocked for everyone: {RAID_PLAN.blocked.map((b) => `${DAYS[b.day]} ${hourLabel(b.from)}–${hourLabel(b.to)} ${b.label.toLowerCase()}`).join(", ")}.</p>
  {#if loadError}<p class="hint error">{loadError} <button class="ghost" onclick={() => { loaded = false; void load(); }}>Try again</button></p>{/if}
</section>

{#if !loaded}<p class="hint">Loading…</p>
{:else if tab === "mine" || !summary}
<section>
  <div class="tools">
    <div class="seg" role="group" aria-label="Save for">
      <button class:on={scope === "every"} aria-pressed={scope === "every"} onclick={() => { scope = "every"; dirty = true; }}>Every week</button>
      <button class:on={scope === "week"} aria-pressed={scope === "week"} onclick={() => { scope = "week"; dirty = true; }}>Only {offset ? "next" : "this"} week</button>
    </div>
    <span class="dim">{hoursCount} h free{own ? ` · this week has its own hours` : mine ? " · your usual hours" : ""}</span>
    <span class="grow"></span>
    {#if own}<button class="ghost" disabled={gs.busy} onclick={backToEvery} title="Forget this week's own hours: your every-week hours count again">Use my usual hours</button>{/if}
    <button class="ghost" disabled={!dirty || gs.busy} onclick={reset}>Undo changes</button>
    <button disabled={!dirty || gs.busy} onclick={save}>Save</button>
  </div>
  <p class="hint small">{scope === "every"
    ? "Your usual week: it counts for every week that has no hours of its own."
    : `Only the week of ${weekLabel(week)}: your usual hours stay as they are for the other weeks.`}
    Click or drag over hours to mark them; again to clear.</p>

  <form class="range" onsubmit={(e) => { e.preventDefault(); applyRange(); }}>
    <select bind:value={rDay} aria-label="Day">{#each DAY_NAMES as d, i}<option value={i}>{d}</option>{/each}</select>
    <label>from <select bind:value={rFrom}>{#each Array(24) as _, h}<option value={h}>{hourLabel(h)}</option>{/each}</select></label>
    <label>to <select bind:value={rTo}>{#each Array(24) as _, h}<option value={h + 1}>{hourLabel(h + 1)}</option>{/each}</select></label>
    <div class="seg" role="group" aria-label="Free or not"><button type="button" class:on={rFree} onclick={() => (rFree = true)}>Free</button><button type="button" class:on={!rFree} onclick={() => (rFree = false)}>Not free</button></div>
    <button class="ghost" disabled={rTo <= rFrom}>Apply</button>
  </form>

  <div class="grid" role="group" aria-label="My free hours" onpointerup={() => (painting = null)} onpointerleave={() => (painting = null)}>
    <div class="corner"></div>
    {#each DAYS as d, day}<div class="day">
      <b>{d}</b> <span class="dim">{dateOf(day).getUTCDate()}</span>
      <button class="ghost tiny" title={dayFull(day) ? `Clear ${DAY_NAMES[day]}` : `Free all ${DAY_NAMES[day]}`} onclick={() => change(setDay(draft, day, !dayFull(day)))}>{dayFull(day) ? "Clear" : "All day"}</button>
    </div>{/each}
    {#each Array(24) as _, h}
      <div class="hour">{hourLabel(h)}</div>
      {#each DAYS as _, day}{@const s = slotOf(day, h)}{@const b = blockOf(s)}
        <button type="button" class="cell" class:free={draft[s]} class:blocked={b} class:now={s === nowSlot} disabled={!!b}
          aria-label="{DAY_NAMES[day]} {hourLabel(h)}: {b ?? (draft[s] ? 'free' : 'not free')}" aria-pressed={draft[s]}
          title={b ? `${b}: blocked` : `${DAY_NAMES[day]} ${hourLabel(h)}–${hourLabel(h + 1)}`}
          onpointerdown={(e) => paintStart(s, e)} onpointerenter={() => paint(s)} onkeydown={(e) => toggleKey(s, e)}></button>
      {/each}
    {/each}
  </div>
  {#if dirty}<p class="hint warn">Not saved yet.</p>{/if}
</section>
{:else}
<section>
  <p class="dim">{members?.length ?? 0} of {view.memberCount} members marked their hours{notMarked ? ` · ${notMarked} not yet` : ""}.</p>
  {#if days.length}
    <h3>Best times, {offset ? "next" : "this"} week</h3>
    <ol class="best">{#each days.slice(0, 4) as d (d.day)}
      <li><b>{range(d)}</b> · {d.count} free · {d.classes.map(([c, n]) => `${c} ${n}`).join(", ")}
        <div class="dim">{d.who.map((w) => w.name).join(", ")}</div></li>{/each}</ol>
  {:else}<p class="hint">Nobody marked free hours for this week yet.</p>{/if}

  <div class="grid heat" role="group" aria-label="Members free per hour">
    <div class="corner"></div>
    {#each DAYS as d, day}<div class="day"><b>{d}</b> <span class="dim">{dateOf(day).getUTCDate()}</span></div>{/each}
    {#each Array(24) as _, h}
      <div class="hour">{hourLabel(h)}</div>
      {#each DAYS as _, day}{@const s = slotOf(day, h)}{@const b = blockOf(s)}{@const n = bySlot[s]?.length ?? 0}
        <button class="cell" class:blocked={b} class:now={s === nowSlot} class:picked={picked === s} disabled={!!b}
          style:--level={n / most} aria-label="{DAY_NAMES[day]} {hourLabel(h)}: {b ?? `${n} free`}"
          title={b ? `${b}: blocked` : `${DAY_NAMES[day]} ${hourLabel(h)}: ${n} free`} onclick={() => (picked = picked === s ? null : s)}>{n || ""}</button>
      {/each}
    {/each}
  </div>
  {#if picked !== null}
    <h3>{DAY_NAMES[Math.floor(picked / 24)]} {hourLabel(picked % 24)}–{hourLabel(picked % 24 + 1)} · {pickedWho.length} free</h3>
    {#if pickedWho.length}<p>{classesOf(pickedWho).map(([c, n]) => `${c} ${n}`).join(" · ")}</p>
      <ul class="who">{#each pickedWho as w (w.name)}<li>{w.name} <span class="dim">{w.className || "class not known"}</span></li>{/each}</ul>
    {:else}<p class="hint">Nobody free at this hour.</p>{/if}
  {:else}<p class="hint small">Click an hour to see who is free and their classes.</p>{/if}
</section>
{/if}

<style>
  .head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
  .head h2 { margin-right: auto; }
  .seg small { color: var(--faint); margin-left: 4px; }
  .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 4px; }
  .grow { flex: 1; }
  .small { font-size: 12px; }
  .warn { color: var(--warn-ink); }
  .range { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 8px 0 12px; }
  .range label { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
  .grid { display: grid; grid-template-columns: 48px repeat(7, minmax(36px, 1fr)); gap: 2px; user-select: none; touch-action: none; max-width: 760px; }
  .day { display: flex; flex-direction: column; align-items: center; font-size: 12px; padding-bottom: 4px; }
  .tiny { height: 20px; padding: 0 6px; font-size: 11px; }
  .hour { font-size: 11px; color: var(--faint); text-align: right; padding-right: 6px; line-height: 18px; font-variant-numeric: tabular-nums; }
  .cell { height: 18px; border-radius: 3px; background: var(--ground); cursor: pointer; border: 1px solid transparent; padding: 0; }
  .cell.free { background: var(--primary); }
  .cell.now { border-color: var(--gold-ink); }
  .cell.blocked { cursor: not-allowed; background: repeating-linear-gradient(135deg, var(--raised) 0 4px, var(--ground) 4px 8px); }
  .heat .cell { font-size: 10px; color: var(--text); font-variant-numeric: tabular-nums;
    background: color-mix(in srgb, var(--primary) calc(var(--level, 0) * 85%), var(--ground)); }
  .heat .cell.blocked { background: repeating-linear-gradient(135deg, var(--raised) 0 4px, var(--ground) 4px 8px); }
  .heat .cell.picked { outline: 2px solid var(--text); outline-offset: -1px; }
  .best { padding-left: 20px; margin: 4px 0 14px; }
  .best li { margin-bottom: 6px; }
  .who { columns: 2; padding-left: 18px; margin: 4px 0; }
  h3 { font-size: 14px; margin: 14px 0 6px; }
</style>
