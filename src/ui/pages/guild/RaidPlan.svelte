<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { NativeSelect, NativeSelectOption } from "$lib/components/ui/native-select/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  // Raid plan: each member paints the hours they are free (every week, or only one week); with view.raidsummary,
  // everyone's hours added up: how many are free each hour, who, which classes, and each day's best stretch.
  import { cancelCallup, createCallup, getAvailability, saveAvailability, testCallup } from "../../../app/guild.ts";
  import { refreshGuild } from "../../actions.ts";
  import { can, type GuildLink, type GuildView } from "../../../domain/guild.ts";
  import {
    addWeeks, bestDays, blockOf, CALLUP_MIN_FREE, callupFor, decodeWeek, hourKind, unblocked, classesOf, DAY_NAMES, DAYS, emptyWeek, freeBySlot, hourLabel, hoursFor, ownWeek, setDay, setRange,
    slotNow, slotOf, slotStart, weekOf, withClasses, NO_CLASS, type Availability, type MemberAvailability, type Week,
  } from "../../../domain/raidplan.ts";
  import { RAID_PLAN } from "../../../config.ts";
  import { officialProfile } from "../../../infra/armory.ts";
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
  /** Every week's hours, to colour what "only this week" changes. */
  const usual = $derived(mine ? unblocked(decodeWeek(mine.slots)) : emptyWeek());
  const kind = (s: number) => hourKind(draft[s], usual[s], scope === "week");

  // ---- Everyone ----
  // A member who joined by typing a name has no class on their card: ask their official profile on their own server
  // (desktop app only; one lookup per name, cached by infra/armory.ts). Server not known: no guess (another player
  // of the same name on the guild's server would give the wrong class).
  let found = $state<Record<string, string>>({});
  const asked = new Set<string>();
  $effect(() => {
    for (const m of members ?? []) {
      if (m.className || m.serverId === null || asked.has(m.name)) continue;
      asked.add(m.name);
      officialProfile(m.name, m.serverId).then((p) => { if (p?.className) found[m.name] = p.className; }).catch(() => {});
    }
  });
  const everyone = $derived(members ? withClasses(members, found) : null);
  const bySlot = $derived(everyone ? freeBySlot(everyone, week) : []);
  const most = $derived(Math.max(1, ...bySlot.map((w) => w.length)));
  const days = $derived(everyone ? bestDays(everyone, week) : []);
  let picked = $state<number | null>(null);
  const pickedWho = $derived(picked === null ? [] : bySlot[picked] ?? []);
  const notMarked = $derived(Math.max(0, view.memberCount - (members?.length ?? 0)));
  // A day with CALLUP_MIN_FREE or more free at once: officers can call the raid from here (posted now, 3 h and 1 h before).
  const plans = $derived(can(view, g, "manage.callups"));
  // Call-up times come back on this PC's clock (shifted by its offset to the Worker's): the same hour within 5 minutes.
  const planned = (atMs: number) => view.callups.find((c) => Math.abs(c.atMs - atMs) < 5 * 60_000) ?? null;
  const makeCallup = (d: (typeof days)[number]) => {
    const c = callupFor(d, week, Date.now());
    if (!c) return;
    if (!confirm(`Call the raid for ${range(d)} with @everyone?\nPosted to Discord now, then 3 h and 1 h before.\n\n${c.message}`)) return;
    void run(() => createCallup(ui.data, c).then(() => refreshGuild(false)), "Call-up made: posted to Discord within a minute");
  };
  /** The toggle switched off: the call-up cancelled (no more reminders) and "Raid cancelled" posted with its ping. */
  const cancelIt = (d: (typeof days)[number], id: string) => {
    if (!confirm(`Cancel the raid of ${range(d)}?\nNo more reminders; "Raid cancelled" is posted to Discord with @everyone.`)) return;
    void run(async () => {
      const ok = await cancelCallup(ui.data, id, true);
      await refreshGuild(false);
      if (ok === false) throw new Error("Call-up cancelled, but Discord refused the \"Raid cancelled\" post: check the webhook");
    }, view.hasWebhook ? "Raid cancelled: posted to Discord" : "Raid cancelled (no Discord webhook: nothing posted)");
  };
  const testIt = (d: (typeof days)[number]) => {
    const c = callupFor(d, week, Date.now());
    if (!c || !confirm(`Post a TEST of this call-up to Discord now, with @everyone?\nIt pings everyone in the channel; nothing is planned.`)) return;
    void run(() => testCallup(ui.data, c), "Test posted to Discord with @everyone (nothing planned)");
  };
  const range = (d: { day: number; from: number; to: number }) => `${DAY_NAMES[d.day]} ${dateOf(d.day).getUTCDate()}, ${hourLabel(d.from)}–${hourLabel(d.to)}`;
</script>

<Panel title="Raid plan">
  {#snippet actions()}
    <ToggleGroup.Root type="single" variant="outline" size="sm" aria-label="Week" value={String(offset)} onValueChange={(v) => { if (v) { offset = Number(v); picked = null; } }}>
      <ToggleGroup.Item value="0">This week <small class="text-muted-foreground">{weekLabel(thisWeek)}</small></ToggleGroup.Item><ToggleGroup.Item value="1">Next week <small class="text-muted-foreground">{weekLabel(addWeeks(thisWeek, 1))}</small></ToggleGroup.Item>
    </ToggleGroup.Root>
    {#if summary}<ToggleGroup.Root type="single" variant="outline" size="sm" aria-label="View" value={tab} onValueChange={(v) => { if (v) { tab = v as typeof tab; } }}>
      <ToggleGroup.Item value="mine">My hours</ToggleGroup.Item><ToggleGroup.Item value="guild">Everyone (summary)</ToggleGroup.Item>
    </ToggleGroup.Root>{/if}{/snippet}
  <p class="hint">Times are server time ({zoneName}){localDiffers ? ", which may differ from your clock" : ""}. Hatched hours are
    blocked for everyone: {RAID_PLAN.blocked.map((b) => `${DAYS[b.day]} ${hourLabel(b.from)}–${hourLabel(b.to)} ${b.label.toLowerCase()}`).join(", ")}.</p>
  {#if loadError}<p class="hint error">{loadError} <Button variant="ghost" size="sm" onclick={() => { loaded = false; void load(); }}>Try again</Button></p>{/if}
</Panel>

{#if !loaded}<p class="hint">Loading…</p>
{:else if tab === "mine" || !summary}
<Panel>
  <div class="tools">
    <ToggleGroup.Root type="single" variant="outline" size="sm" aria-label="Save for" value={scope} onValueChange={(v) => { if (v) { scope = v as typeof scope; dirty = true; } }}>
      <ToggleGroup.Item value="every">Every week</ToggleGroup.Item><ToggleGroup.Item value="week">Only {offset ? "next" : "this"} week</ToggleGroup.Item>
    </ToggleGroup.Root>
    <span class="dim">{hoursCount} h free{own ? ` · this week has its own hours` : mine ? " · your usual hours" : ""}</span>
    <span class="grow"></span>
    {#if own}<Button variant="ghost" size="sm" disabled={gs.busy} onclick={backToEvery} title="Forget this week's own hours: your every-week hours count again">Use my usual hours</Button>{/if}
    <Button variant="ghost" size="sm" disabled={!dirty || gs.busy} onclick={reset}>Undo changes</Button>
    <Button size="sm" disabled={!dirty || gs.busy} onclick={save}>Save</Button>
  </div>
  <p class="hint small">{scope === "every"
    ? "Your usual week: it counts for every week that has no hours of its own."
    : `Only the week of ${weekLabel(week)}: your usual hours stay as they are for the other weeks.`}
    Click or drag over hours to mark them; again to clear.</p>
  <div class="legend" aria-label="Colours">
    <span><i class="free"></i>Free every week</span>
    {#if scope === "week"}<span><i class="freeWeek"></i>Free only this week</span>{/if}
    <span><i class="busy"></i>Not free every week</span>
    {#if scope === "week"}<span><i class="busyWeek"></i>Not free only this week</span>{/if}
    <span><i class="blocked"></i>Blocked</span>
  </div>

  <form class="range" onsubmit={(e) => { e.preventDefault(); applyRange(); }}>
    <NativeSelect size="sm" bind:value={rDay} aria-label="Day">{#each DAY_NAMES as d, i}<NativeSelectOption value={i}>{d}</NativeSelectOption>{/each}</NativeSelect>
    <label>from <NativeSelect size="sm" bind:value={rFrom}>{#each Array(24) as _, h}<NativeSelectOption value={h}>{hourLabel(h)}</NativeSelectOption>{/each}</NativeSelect></label>
    <label>to <NativeSelect size="sm" bind:value={rTo}>{#each Array(24) as _, h}<NativeSelectOption value={h + 1}>{hourLabel(h + 1)}</NativeSelectOption>{/each}</NativeSelect></label>
    <ToggleGroup.Root type="single" variant="outline" size="sm" aria-label="Free or not" value={rFree ? "free" : "busy"} onValueChange={(v) => { if (v) { rFree = v === "free"; } }}>
      <ToggleGroup.Item value="free">Free</ToggleGroup.Item><ToggleGroup.Item value="busy">Not free</ToggleGroup.Item>
    </ToggleGroup.Root>
    <Button type="submit" variant="outline" size="sm" disabled={rTo <= rFrom}>Apply</Button>
  </form>

  <div class="grid" role="group" aria-label="My free hours" onpointerup={() => (painting = null)} onpointerleave={() => (painting = null)}>
    <div class="corner"></div>
    {#each DAYS as d, day}<div class="day">
      <b>{d}</b> <span class="dim">{dateOf(day).getUTCDate()}</span>
      <Button variant="ghost" size="xs" class="h-5 px-1.5 text-xs" title={dayFull(day) ? `Clear ${DAY_NAMES[day]}` : `Free all ${DAY_NAMES[day]}`} onclick={() => change(setDay(draft, day, !dayFull(day)))}>{dayFull(day) ? "Clear" : "All day"}</Button>
    </div>{/each}
    {#each Array(24) as _, h}
      <div class="hour">{hourLabel(h)}</div>
      {#each DAYS as _, day}{@const s = slotOf(day, h)}{@const b = blockOf(s)}
        <button type="button" class="cell {b ? '' : kind(s)}" class:blocked={b} class:now={s === nowSlot} disabled={!!b}
          aria-label="{DAY_NAMES[day]} {hourLabel(h)}: {b ?? (draft[s] ? 'free' : 'not free')}" aria-pressed={draft[s]}
          title={b ? `${b}: blocked` : `${DAY_NAMES[day]} ${hourLabel(h)}–${hourLabel(h + 1)}`}
          onpointerdown={(e) => paintStart(s, e)} onpointerenter={() => paint(s)} onkeydown={(e) => toggleKey(s, e)}></button>
      {/each}
    {/each}
  </div>
  {#if dirty}<p class="hint warn">Not saved yet.</p>{/if}
</Panel>
{:else}
<Panel>
  <p class="dim">{members?.length ?? 0} of {view.memberCount} members marked their hours{notMarked ? ` · ${notMarked} not yet` : ""}.</p>
  {#if days.length}
    <h3 class="mt-4 mb-2 text-sm font-semibold">Best times, {offset ? "next" : "this"} week</h3>
    <ol class="best">{#each days.slice(0, 4) as d (d.day)}
      <li><div class="what"><b>{range(d)}</b> · {d.count} free · {d.classes.map(([c, n]) => `${c} ${n}`).join(", ")}
        <div class="dim">{d.who.map((w) => w.name).join(", ")}</div></div>
        {#if plans && d.count >= CALLUP_MIN_FREE}{@const c = callupFor(d, week, ui.now)}
          <div class="callup">
          {#if !c}<span class="dim">Already begun</span>
          {:else}{@const on = planned(c.atMs)}
            <label class="flex cursor-pointer items-center gap-2 text-sm"
              title={on ? "On: reminders now, 3 h and 1 h before. Switch off to cancel the raid and post \"Raid cancelled\" (@everyone)"
                : "@everyone, the names of those free, 'Your spot is not guaranteed': posted now, 3 h and 1 h before"}>
              <!-- The app's switch; it shows what is planned, so it moves once the Worker has it. -->
              <Switch checked={!!on} disabled={gs.busy} onCheckedChange={() => { if (on) cancelIt(d, on.id); else makeCallup(d); }} />{on ? "Call-up on" : "Make a call-up"}</label>
            <Button variant="ghost" size="sm" disabled={gs.busy || !view.hasWebhook} onclick={() => testIt(d)}
              title={view.hasWebhook ? "Post it once to Discord with @everyone, to check the ping: nothing planned" : "Set a Discord webhook first"}>Test ping</Button>{/if}
          </div>
        {/if}
      </li>{/each}</ol>
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
    <h3 class="mt-4 mb-2 text-sm font-semibold">{DAY_NAMES[Math.floor(picked / 24)]} {hourLabel(picked % 24)}–{hourLabel(picked % 24 + 1)} · {pickedWho.length} free</h3>
    {#if pickedWho.length}<p>{classesOf(pickedWho).map(([c, n]) => `${c} ${n}`).join(" · ")}</p>
      <ul class="who">{#each pickedWho as w (w.name)}<li>{w.name} <span class="dim">{w.className || NO_CLASS}</span></li>{/each}</ul>
    {:else}<p class="hint">Nobody free at this hour.</p>{/if}
  {:else}<p class="hint small">Click an hour to see who is free and their classes.</p>{/if}
</Panel>
{/if}

<style>
  .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 4px; }
  .grow { flex: 1; }
  .small { font-size: var(--fs-sm); }
  .warn { color: var(--warn-ink); }
  .range { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 8px 0 12px; }
  .range label { display: inline-flex; align-items: center; gap: 6px; color: var(--muted-foreground); }
  .grid { display: grid; grid-template-columns: 48px repeat(7, minmax(36px, 1fr)); gap: 2px; user-select: none; touch-action: none; max-width: 760px; }
  .day { display: flex; flex-direction: column; align-items: center; font-size: var(--fs-sm); padding-bottom: 4px; }
  .hour { font-size: var(--fs-xs); color: var(--faint); text-align: right; padding-right: 6px; line-height: 18px; font-variant-numeric: tabular-nums; }
  .cell { height: 18px; border-radius: 3px; background: var(--ground); cursor: pointer; border: 1px solid transparent; padding: 0; }
  /* My hours: free / not free every week (dark green / red), or only this week (light green / orange). */
  .cell.free, .legend .free { background: var(--ok-fill); }
  .cell.freeWeek, .legend .freeWeek { background: #7fd68f; }
  .cell.busy, .legend .busy { background: color-mix(in srgb, #c0392b 55%, var(--ground)); }
  .cell.busyWeek, .legend .busyWeek { background: #ec8a2f; }
  .legend .blocked { background: repeating-linear-gradient(135deg, var(--raised) 0 3px, var(--ground) 3px 6px); }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0 0 10px; font-size: var(--fs-sm); color: var(--muted-foreground); }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend i { width: 14px; height: 10px; border-radius: 2px; display: inline-block; }
  .cell.now { border-color: var(--gold-ink); }
  .cell.blocked { cursor: not-allowed; background: repeating-linear-gradient(135deg, var(--raised) 0 4px, var(--ground) 4px 8px); }
  .heat .cell { font-size: var(--fs-xs); color: var(--text); font-variant-numeric: tabular-nums;
    background: color-mix(in srgb, var(--primary) calc(var(--level, 0) * 85%), var(--ground)); }
  .heat .cell.blocked { background: repeating-linear-gradient(135deg, var(--raised) 0 4px, var(--ground) 4px 8px); }
  .heat .cell.picked { outline: 2px solid var(--text); outline-offset: -1px; }
  .best { padding-left: 20px; margin: 4px 0 14px; }
  .best li { margin-bottom: 6px; }
  .best li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 16px; }
  .callup { display: flex; gap: 6px; justify-content: flex-end; }
  .who { columns: 2; padding-left: 18px; margin: 4px 0; }
  h3 { font-size: var(--fs-lg); margin: 14px 0 6px; }
</style>
