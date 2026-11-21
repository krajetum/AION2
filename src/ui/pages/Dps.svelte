<script lang="ts">
  import Intro from "$lib/components/app/Intro.svelte";
  import Empty from "../parts/Empty.svelte";
  import PlayerStats from "../parts/PlayerStats.svelte";
  import { SvelteSet } from "svelte/reactivity";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { NativeSelect, NativeSelectOption } from "$lib/components/ui/native-select/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import StatTile from "$lib/components/app/StatTile.svelte";
  import UnderlineTabs from "$lib/components/app/UnderlineTabs.svelte";
  import FightChart from "$lib/components/charts/FightChart.svelte";
  import { clock, displayName, hpLeft, short, STATUS_TEXT, TARGET_MODES, viewRows, VIEWS, type MeterUpdate, type MeterView, classColor, skillIconUrl } from "../../domain/meter.ts";
  import { trackSeries } from "../../domain/timeline.ts";
  import { meterOverlay, netOverlay, meterPartyOnly, meterPause, meterReconnect, meterReset, meterTargetMode, meterView, meterWatch, onMeter } from "../../infra/meter.ts";
  import { isDesktop } from "../../infra/system.ts";
  import { act } from "../actions.ts";
  import { classIcon } from "../classes.ts";
  import { showStatus } from "../overlays.ts";
  import { live, ui } from "../state.svelte.ts";

  let u = $state<MeterUpdate | undefined>();
  const open = new SvelteSet<number>(); // players whose skill breakdown is shown
  $effect(() => onMeter((x) => { u = x; })); // the first visit starts the capture
  // Per-skill details only for the rows that are open; none once the page is left.
  $effect(() => { meterWatch([...open]).catch(() => {}); return () => { meterWatch([]).catch(() => {}); }; });

  let picked = $state<number | null>(null); // endMs of a recent target shown instead of the live fight
  const past = $derived(picked == null ? undefined : ui.recentFights.find((r) => r.endMs === picked));
  const f = $derived(past?.fight ?? u?.fight);
  const left = $derived(f?.target ? hpLeft(f.target) : undefined);
  const idle = $derived(ui.data.settings.dpsIdleSeconds);
  const idleText = $derived(idle ? `${idle} s without activity` : "never (Settings)");
  const view = $derived(u?.view ?? "damage");
  const rows = $derived(f ? viewRows(f, view) : []);
  const unnamed = $derived(rows.some(({ row: r }) => !r.name && !r.isYou));
  // Column labels per view: per second, total, and what the breakdown lists.
  const COLS = { damage: ["DPS", "Damage"], healing: ["HPS", "Healing"], taken: ["Taken/s", "Taken"] } as const;
  // The fight's totals for the stat tiles.
  const secs = $derived(Math.max(1, (f?.battleTimeMs ?? 0) / 1000));
  const totals = $derived.by(() => {
    const r = f?.rows ?? [];
    const sum = (k: (x: (typeof r)[number]) => number) => r.reduce((a, x) => a + k(x), 0);
    return { damage: sum((x) => x.damage), heal: sum((x) => x.heal), taken: sum((x) => x.damageTaken), deaths: sum((x) => x.deaths ?? 0) };
  });
  // The live boss fight second by second (main.ts samples it): one line per player in their class colour.
  const chart = $derived.by(() => {
    if (past || !f?.target?.isBoss) return null;
    const { series, hp } = trackSeries(live.track, f.rows);
    const lines = f.rows.filter((r) => series[displayName(r)])
      .map((r, i) => ({ name: displayName(r), values: series[displayName(r)], color: classColor(r.job) || `--chart-${(i % 5) + 1}` }));
    const deaths = f.rows.flatMap((r) => (r.deathTimes ?? []).map((ms) => ({ t: ms / 1000, name: displayName(r) })));
    return hp.length > 1 ? { lines, hp, deaths } : null;
  });

  async function run(what: () => Promise<unknown>) {
    try { await what(); } catch (e) { showStatus("DPS meter: " + e, true); }
  }
  const toggle = (id: number) => (open.has(id) ? open.delete(id) : open.add(id));
  // Packets lost in the last minute (the parser fell behind): the numbers miss some hits.
  const lostLog: [number, number][] = [];
  let lostRecently = $state(0);
  $effect(() => {
    const n = ui.meter?.lostPackets ?? 0, now = ui.now;
    lostLog.push([now, n]);
    while (lostLog.length && now - lostLog[0][0] > 60_000) lostLog.shift();
    lostRecently = n - (lostLog[0]?.[1] ?? n);
  });
  const DOT = { connected: "bg-hps", searching: "bg-gold", "waiting-game": "bg-faint-foreground", "no-capture": "bg-destructive" } as const;
</script>

<p class="hint mt-0 mb-2">Third-party tools may be against the game's terms of service: use at your own risk.</p>
<Intro>
  <p>Reads a copy of the game's network traffic through Npcap. Never touches the game's memory or files.
    {#if idle}The fight resets after {idle} s without damage, healing or damage taken (Settings).{/if}</p>
  <!-- What the game has told the companion besides the fight: shows which of these never arrived. -->
  {#if u}{@const maps = new Set(u.bosses.map((b) => b.mapId))}
  <p>Game data: playing <b>{u.profile?.name ?? "not said yet"}</b>{#if u.profile?.level} (lv {u.profile.level}){/if}
    · Odyle {u.odyle ? `${u.odyle.basic}/${u.odyle.charged} (${u.odyle.owner ?? "owner not said yet"})` : "not sent yet"}
    · boss maps read: {maps.size} ({u.bosses.length} bosses: {u.bosses.filter((b) => b.up).length} up, {u.bosses.filter((b) => !b.up && b.timeMs > Date.now()).length} respawning, {u.bosses.filter((b) => !b.timeMs).length} no time)
    · saved boss timers: {ui.data.bosses.length}</p>{/if}
</Intro>

{#if !u || !f}<Card.Root class="mt-3"><Card.Content class="text-sm text-muted-foreground">Starting the meter…</Card.Content></Card.Root>{:else}
  <div class="mt-3 mb-3 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2 text-sm {u.status === 'no-capture' ? 'border-destructive/40 bg-destructive/10' : 'bg-card'}">
    <span class="size-2 rounded-full {DOT[u.status]}"></span><b class="font-semibold">{STATUS_TEXT[u.status]}</b><span class="text-muted-foreground">{u.message}</span>
    <span class="grow"></span>
    {#if u.pingMs != null}<span class="tabular-nums text-muted-foreground">{u.pingMs} ms{#if u.lossPct != null} · <span title="Packets resent on the game connection in the last minute: at most the real loss">{u.lossPct.toFixed(1)}% loss</span>{/if}</span>{/if}
    <!-- The meter's own controls sit with its status; the toolbar below is only what to show. -->
    <Button variant="ghost" size="sm" aria-pressed={u.paused} onclick={() => run(() => meterPause(!u!.paused))}>{u.paused ? "Resume" : "Pause"}</Button>
    <Button variant="ghost" size="sm" onclick={() => run(async () => { await meterReset(); open.clear(); })}>Reset</Button>
    <Button variant="ghost" size="sm" onclick={() => run(async () => { await meterReconnect(); showStatus("Looking for the game connection again…"); })}>Reconnect</Button></div>
  {#if lostRecently}<p class="hint warn-line">The meter fell behind the game's traffic and lost {lostRecently.toLocaleString("en-US")} packets in the
    last minute: the numbers above miss some hits. It happens in very crowded fights (sieges).</p>{/if}

  {#if u.status === "no-capture"}<Card.Root class="mb-3"><Card.Header><Card.Title>Npcap is needed</Card.Title></Card.Header>
    <Card.Content class="text-sm">Install <a class="text-primary underline-offset-4 hover:underline" href="https://npcap.com/#download" target="_blank" rel="noopener">Npcap</a> (free),
      tick <b>“Install Npcap in WinPcap API-compatible Mode”</b>, then restart the companion. If you ticked “Restrict Npcap driver's access
      to Administrators only”, the companion must run as administrator.</Card.Content></Card.Root>
  {:else if u.status === "searching"}<p class="hint">Still searching after a fight? Hit Reconnect, or start the companion before the game.</p>{/if}

  <!-- One toolbar: what to show from the left (target, who), the overlays on the right. -->
  <div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
    <span class="text-muted-foreground">Target</span>
    <NativeSelect size="sm" aria-label="Target mode" value={f.targetMode} onchange={(e) => run(() => meterTargetMode(e.currentTarget.value))}>
      {#each TARGET_MODES as [id, label]}<NativeSelectOption value={id}>{label}</NativeSelectOption>{/each}</NativeSelect>
    <ToggleGroup.Root type="single" variant="outline" size="sm" aria-label="Who to show" value={u.partyOnly ? "party" : "all"}
      onValueChange={(v) => v && run(() => meterPartyOnly(v === "party"))}>
      <ToggleGroup.Item value="all" title="Everyone on the target">Everyone</ToggleGroup.Item>
      <ToggleGroup.Item value="party">My party</ToggleGroup.Item>
    </ToggleGroup.Root>
    {#if ui.recentFights.length}<span class="ml-2 text-muted-foreground">Showing</span>
      <NativeSelect size="sm" aria-label="Fight shown" value={past ? String(past.endMs) : ""} onchange={(e) => { picked = e.currentTarget.value ? Number(e.currentTarget.value) : null; }}>
        <NativeSelectOption value="">Live fight</NativeSelectOption>
        {#each ui.recentFights as r (r.endMs)}<NativeSelectOption value={String(r.endMs)}>{r.fight.target?.name || "Unknown target"} · {clock(r.fight.battleTimeMs)} · ended {new Date(r.endMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</NativeSelectOption>{/each}
      </NativeSelect>{#if past}<Button variant="ghost" size="sm" onclick={() => { picked = null; }}>Back to live</Button>{/if}{/if}
    <span class="grow"></span>
    <Button variant={ui.overlay ? "secondary" : "outline"} size="sm" aria-pressed={ui.overlay} disabled={!isDesktop()} title={isDesktop() ? "The DPS overlay: shows during fights, hides after " + idleText : "Desktop app only"}
      onclick={() => run(async () => { const on = !ui.overlay; await act(() => { ui.data.settings.dpsOverlay = on; }); await meterOverlay(on); })}>Overlay</Button>
    <Button variant={ui.data.settings.netOverlay ? "secondary" : "outline"} size="sm" aria-pressed={ui.data.settings.netOverlay} disabled={!isDesktop()} title={isDesktop() ? "A small always-on-top line with the ping and packet loss" : "Desktop app only"}
      onclick={() => run(async () => { const on = !ui.data.settings.netOverlay; await act(() => { ui.data.settings.netOverlay = on; }); await netOverlay(on); })}>Ping overlay</Button>
  </div>

  {#if f.target}{@const t = f.target}
    <div class="mb-3 flex items-baseline gap-2">
      <h2 class="m-0 text-xl font-semibold">{t.name || "Unknown target"}</h2>{#if t.isBoss}<Badge variant="secondary">Boss</Badge>{/if}
      <span class="ml-auto text-2xl font-semibold tabular-nums">{clock(f.battleTimeMs)}</span>
    </div>
    <Card.Root class="mb-3 gap-0 py-0">
      <div class="grid grid-cols-2 divide-border md:grid-cols-4 md:divide-x">
        <StatTile label="Party DPS" tone="dps" active={view === "damage"} value={short(totals.damage / secs)} sub="{short(totals.damage)} damage" />
        <StatTile label="Party HPS" tone="hps" active={view === "healing"} value={short(totals.heal / secs)} sub="{short(totals.heal)} healed" />
        <StatTile label="Taken DPS" tone="taken" active={view === "taken"} value={short(totals.taken / secs)} sub="{short(totals.taken)} taken" />
        <StatTile label={left != null ? "Boss HP" : "Deaths"} value={left != null ? `${Math.round(left * 100)}%` : String(totals.deaths)}
          sub={left != null ? `of ${short(t.maxHp)} HP · ${totals.deaths} deaths` : ""} />
      </div>
      {#if left != null}<Progress value={left * 100} class="h-1 rounded-none" />{/if}
    </Card.Root>
  {/if}

  <Card.Root class="gap-3 pt-2 pb-3">
    <div class="px-4"><UnderlineTabs label="Show" items={VIEWS} value={view} onchange={(v: MeterView) => run(() => meterView(v))} /></div>
    {#if chart && view === "damage"}<div class="px-4"><FightChart lines={chart.lines} hp={chart.hp} deaths={chart.deaths} party /></div>{/if}

    {#if rows.length}<div class="px-2"><Table.Root>
      <Table.Header><Table.Row class="hover:bg-transparent">
        <Table.Head class="w-8"></Table.Head><Table.Head class="text-muted-foreground">Player</Table.Head>
        <Table.Head class="text-right text-muted-foreground">{COLS[view][1]}</Table.Head><Table.Head class="text-right text-muted-foreground">{COLS[view][0]}</Table.Head>
        <Table.Head class="text-right text-muted-foreground">{view === "taken" ? "Hits" : "Share"}</Table.Head></Table.Row></Table.Header>
      <Table.Body>{#each rows as { row: r, value, perSec, share } (r.id)}{@const expandable = view !== "taken"}
        <Table.Row class="bar-row border-0 {view === 'healing' ? 'heal' : view === 'taken' ? 'taken' : ''} {expandable ? 'cursor-pointer' : ''}"
          style="--p: {Math.min(1, share / 100)}; {classColor(r.job) && view === 'damage' ? `--cls: ${classColor(r.job)}` : ''}"
          tabindex={expandable ? 0 : undefined} aria-expanded={expandable ? open.has(r.id) : undefined} onclick={() => expandable && toggle(r.id)}>
          <Table.Cell class="w-8 text-muted-foreground">{#if expandable}<ChevronRight class="size-4 transition-transform {open.has(r.id) ? 'rotate-90' : ''}" />{/if}</Table.Cell>
          <Table.Cell><span class="flex items-center gap-2">{#if classIcon(r.job)}<img class="size-5 object-contain" src={classIcon(r.job)} alt={r.job} title={r.job}>{:else}<span class="size-5" aria-hidden="true"></span>{/if}
            <span class="font-medium {r.isYou ? 'text-primary' : ''} {!r.name ? 'font-normal text-muted-foreground' : ''}">{displayName(r)}</span>
            {#if r.inParty && !r.isYou && !u.partyOnly}<span class="text-xs text-muted-foreground">party</span>{/if}
            {#if r.combatPower}<span class="text-xs text-muted-foreground">CP {short(r.combatPower)}</span>{/if}</span></Table.Cell>
          <Table.Cell class="text-right tabular-nums">{short(value)}</Table.Cell>
          <Table.Cell class="text-right font-semibold tabular-nums">{short(perSec)}</Table.Cell>
          <Table.Cell class="text-right tabular-nums">{view === "taken" ? r.hitsTaken : share.toFixed(1) + "%"}</Table.Cell></Table.Row>
        {#if expandable && open.has(r.id)}{@const list = view === "healing" ? r.healSkills : r.skills}<Table.Row class="hover:bg-transparent"><Table.Cell colspan={5} class="bg-muted/40 p-3 whitespace-normal">
          {#if f.target?.isBoss}<PlayerStats row={r} ms={f.battleTimeMs} />{/if}
          <Table.Root><Table.Header><Table.Row class="hover:bg-transparent">
            <Table.Head class="text-muted-foreground">Skill</Table.Head><Table.Head class="text-right text-muted-foreground">{view === "healing" ? "Healing" : "Damage"}</Table.Head>
            <Table.Head class="text-right text-muted-foreground">Share</Table.Head><Table.Head class="text-right text-muted-foreground">{view === "healing" ? "Ticks" : "Hits"}</Table.Head>
            <Table.Head class="text-right text-muted-foreground" title="Times used: hits of a skill close together count as one cast">Used</Table.Head><Table.Head class="text-right text-muted-foreground">Crit</Table.Head></Table.Row></Table.Header>
          <Table.Body>{#each list as s}<Table.Row><Table.Cell><span class="flex items-center gap-2">{#if s.icon}<img class="size-5 rounded" src={skillIconUrl(s.icon)} alt="" loading="lazy"
                onerror={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = "hidden")}>{:else}<span class="size-5 rounded bg-secondary" aria-hidden="true"></span>{/if}{s.name}{#if s.dot}<span class="text-xs text-muted-foreground">{view === "healing" ? "HoT" : "DoT"}</span>{/if}</span></Table.Cell>
              <Table.Cell class="text-right tabular-nums">{short(s.damage)}</Table.Cell><Table.Cell class="text-right tabular-nums">{(s.share * 100).toFixed(1)}%</Table.Cell>
              <Table.Cell class="text-right tabular-nums">{s.hits}</Table.Cell><Table.Cell class="text-right tabular-nums">{s.dot || view === "healing" || s.casts == null ? "–" : s.casts}</Table.Cell>
              <Table.Cell class="text-right tabular-nums">{s.dot || view === "healing" ? "–" : Math.round(s.critRate * 100) + "%"}</Table.Cell></Table.Row>
            {:else}<Table.Row><Table.Cell colspan={6} class="text-muted-foreground">{past ? "Skills kept only for you and the players open during the fight." : "No skill data yet."}</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
        </Table.Cell></Table.Row>{/if}
      {/each}</Table.Body></Table.Root></div>
      <p class="hint px-4">{view === "taken" ? "Damage taken from the fight's monsters." : "Click a player for the skill breakdown (on a boss: hits, deaths and damage taken too)."}{#if unnamed}&nbsp;Players shown as #number: the game sends
        names on loading screens (teleport, zone change, dungeon), so start the companion before you enter.{/if}</p>
    {:else}<div class="px-4"><Empty>{view === "healing" ? "No healing yet." : view === "taken" ? "No damage taken yet." : u.partyOnly ? "No damage from your party yet." : "No fight yet. Hit something."}</Empty></div>{/if}
  </Card.Root>
{/if}
