<script lang="ts">
  import Intro from "$lib/components/app/Intro.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import Empty from "../parts/Empty.svelte";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { NativeSelect, NativeSelectOption } from "$lib/components/ui/native-select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import StatTile from "$lib/components/app/StatTile.svelte";
  import UnderlineTabs from "$lib/components/app/UnderlineTabs.svelte";
  import FightChart from "$lib/components/charts/FightChart.svelte";
  import { classIcon } from "../classes.ts";
  import { mapLabel } from "../../domain/arena.ts";
  import { fightText, personalBests, you, yourDps, type FightRecord } from "../../domain/fights.ts";
  import { activeText, classColor, clock, displayName, hpText, short, skillIconUrl, viewRows, type MeterView } from "../../domain/meter.ts";
  import PlayerDetail from "../parts/PlayerDetail.svelte";
  import SkillCompare from "../parts/SkillCompare.svelte";
  import Timeline from "../parts/Timeline.svelte";
  import { phases, windowTotals } from "../../domain/timeline.ts";
  import { saveFights } from "../../infra/fights.ts";
  import { hm } from "../format.ts";
  import { showStatus } from "../overlays.ts";
  import { fightsSnapshot, ui } from "../state.svelte.ts";

  let boss = $state(""), char = $state(""), open = $state(""), who = $state<number | null>(null), picked = $state<string[]>([]);
  const bossNames = $derived([...new Set(ui.fights.map((f) => f.boss))].sort());
  const chars = $derived([...new Set(ui.fights.map((f) => f.char).filter(Boolean))].sort());
  const list = $derived(ui.fights.filter((f) => (!boss || f.boss === boss) && (!char || f.char === char)));
  const bests = $derived(Object.entries(personalBests(list)).sort(([a], [b]) => a.localeCompare(b)));
  // The two fights to compare, older first.
  const pair = $derived(picked.map((id) => ui.fights.find((f) => f.id === id)).filter((f): f is FightRecord => !!f).sort((a, b) => a.endMs - b.endMs));

  const when = (t: number) => `${new Date(t).toLocaleDateString([], { day: "2-digit", month: "short" })} ${hm(t)}`;
  const where = (f: FightRecord) => (f.mapId == null ? "" : mapLabel(ui.data.arena.maps, f.mapId));
  // Your DPS on a boss over time, oldest first, as a polyline in an 80 × 20 box.
  function spark(name: string) {
    const v = list.filter((f) => f.boss === name).map(yourDps).reverse();
    if (v.length < 2) return "";
    const max = Math.max(...v) || 1;
    return v.map((y, i) => `${((i / (v.length - 1)) * 80).toFixed(1)},${(19 - (y / max) * 18).toFixed(1)}`).join(" ");
  }
  function pick(id: string) {
    picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(-2);
  }
  function remove(id: string) {
    ui.fights = ui.fights.filter((f) => f.id !== id);
    picked = picked.filter((x) => x !== id);
    if (open === id) open = "";
    saveFights(fightsSnapshot()).catch((e) => console.warn("DPS Log not saved", e));
  }
  // Personal bests folded away or not, remembered on this PC.
  const BESTS_KEY = "aion2-dpslog-bests-open";
  let bestsOpen = $state((() => { try { return localStorage.getItem(BESTS_KEY) !== "0"; } catch { return true; } })());
  function foldBests() {
    bestsOpen = !bestsOpen;
    try { localStorage.setItem(BESTS_KEY, bestsOpen ? "1" : "0"); } catch { /* private window: not remembered */ }
  }
  // The boss's HP at the end: "killed", "12% HP left", or for fights from before it only killed or not.
  const hp = (f: FightRecord) => hpText(f.hpLeft) || (f.killed ? "killed" : "not killed");
  const copy = (f: FightRecord) => navigator.clipboard.writeText(fightText(f)).then(() => showStatus("Fight copied"), () => showStatus("Copy failed"));

  // ---- one fight, opened ----
  type Tab = MeterView | "deaths" | "timeline" | "skills";
  let tab = $state<Tab>("damage");
  const f = $derived(open ? ui.fights.find((x) => x.id === open) : undefined);
  const me = $derived(f ? you(f) : undefined);
  const best = $derived(f ? personalBests(ui.fights)[f.boss]?.dps?.id === f.id : false);
  const secs = $derived(Math.max(1, (f?.battleTimeMs ?? 0) / 1000));
  const totals = $derived.by(() => {
    const r = f?.rows ?? [];
    const sum = (k: (x: (typeof r)[number]) => number) => r.reduce((a, x) => a + k(x), 0);
    return { damage: sum((x) => x.damage), heal: sum((x) => x.heal), taken: sum((x) => x.damageTaken), deaths: sum((x) => x.deaths ?? 0) };
  });
  const tabs = $derived([
    ["damage", "Damage"], ["healing", "Healing"], ["taken", "Damage taken"], ["deaths", "Deaths"],
    ...(f?.timeline ? [["timeline", "Timeline"]] : []), ...(me?.skills.length ? [["skills", "Your skills"]] : []),
  ] as [Tab, string][]);
  const rows = $derived(f && (tab === "damage" || tab === "healing" || tab === "taken") ? viewRows({ ...f, target: null, targetMode: "" }, tab) : []);
  const deaths = $derived(f ? f.rows.flatMap((r) => (r.deathTimes ?? []).map((ms, i) => ({ r, ms, back: r.reviveTimes?.[i] }))).sort((a, b) => a.ms - b.ms) : []);
  const chartLines = $derived(f?.series ? [...f.rows].sort((p, q) => q.damage - p.damage).filter((r) => f.series?.[displayName(r)])
    .map((r, i) => ({ name: displayName(r), values: f.series![displayName(r)], color: classColor(r.job) || `--chart-${(i % 5) + 1}` })) : []);
  // A window of the fight dragged on the chart (or a phase clicked): the damage table over those seconds only.
  let range = $state<[number, number] | null>(null);
  const fightPhases = $derived(f?.series && f.hp ? phases(f.hp, f.series, me && displayName(me)) : []);
  const windowRows = $derived.by(() => {
    if (!f?.series || !range) return [];
    const t = windowTotals(f.series, range[0], range[1]), total = t.reduce((a, x) => a + x.damage, 0), secs = range[1] - range[0];
    return t.map((x) => ({ ...x, row: f.rows.find((r) => displayName(r) === x.name), perSec: x.damage / secs, share: (x.damage / total) * 100 }));
  });
  const span = (a: number, b: number) => `${clock(a * 1000)} – ${clock(b * 1000)}`;
  function openFight(id: string) { open = id; who = null; tab = "damage"; range = null; }
</script>

{#if f}
  <!-- One fight, as the meter had it at the end. -->
  <Button variant="ghost" size="sm" class="-ml-2 mb-2 text-muted-foreground" onclick={() => { open = ""; }}><ArrowLeft />DPS Log</Button>
  <div class="mb-4 flex flex-wrap items-center gap-3">
    {#if me && classIcon(me.job)}<img class="size-9 object-contain" src={classIcon(me.job)} alt={me.job}>{/if}
    <div class="min-w-0">
      <h2 class="m-0 text-xl font-semibold">{f.boss}</h2>
      <div class="text-sm text-muted-foreground">{when(f.endMs)}{#if where(f)} · {where(f)}{/if}{#if f.char} · {f.char}{/if}{#if best} · <span class="text-primary">Personal best</span>{/if}</div>
    </div>
    <span class="grow"></span>
    <Button variant="outline" size="sm" onclick={() => copy(f)}>Copy for chat</Button>
    <Button variant="ghost" size="sm" class="text-destructive" onclick={() => remove(f.id)}>Delete</Button>
  </div>

  <Card.Root class="mb-3 gap-0 py-0">
    <div class="grid grid-cols-2 md:grid-cols-5 md:divide-x">
      <StatTile label="Duration" value={clock(f.battleTimeMs)} sub={hp(f)} />
      <StatTile label="Party DPS" tone="dps" active={tab === "damage"} value={short(totals.damage / secs)} sub="{short(totals.damage)} damage" />
      <StatTile label="Party HPS" tone="hps" active={tab === "healing"} value={short(totals.heal / secs)} sub="{short(totals.heal)} healed" />
      <StatTile label="Taken DPS" tone="taken" active={tab === "taken"} value={short(totals.taken / secs)} sub="{short(totals.taken)} taken" />
      <StatTile label="Deaths" active={tab === "deaths"} value={String(totals.deaths)} sub={me ? `You: ${short(me.dps)}/s` : ""} />
    </div>
  </Card.Root>

  <Card.Root class="gap-3 pt-2 pb-3">
    <div class="px-4"><UnderlineTabs label="Show" items={tabs} value={tab} onchange={(v: Tab) => { tab = v; who = null; }} /></div>

    {#if tab === "damage" && chartLines.length && f.hp}<div class="px-4"><FightChart party hp={f.hp} lines={chartLines} {range} onrange={(r) => { range = r; who = null; }}
      deaths={deaths.map((d) => ({ t: d.ms / 1000, name: displayName(d.r) }))} />
      <p class="hint mt-1">Drag across the chart to see the damage in those seconds only; double click for the whole fight.</p></div>

      {#if fightPhases.length > 1}<div class="px-2"><Table.Root>
        <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head class="text-muted-foreground">Boss HP</Table.Head>
          <Table.Head class="text-muted-foreground">Time</Table.Head><Table.Head class="text-right text-muted-foreground">Took</Table.Head>
          <Table.Head class="text-right text-muted-foreground">Party DPS</Table.Head><Table.Head class="text-right text-muted-foreground">Your DPS</Table.Head></Table.Row></Table.Header>
        <Table.Body>{#each fightPhases as p (p.from)}{@const on = range?.[0] === p.from && range?.[1] === p.to}
          <Table.Row class="cursor-pointer {on ? 'bg-muted/60' : ''}" tabindex={0} aria-pressed={on} onclick={() => { range = on ? null : [p.from, p.to]; who = null; }}>
            <Table.Cell class="tabular-nums">{p.hpFrom}% → {p.hpTo}%</Table.Cell><Table.Cell class="tabular-nums text-muted-foreground">{span(p.from, p.to)}</Table.Cell>
            <Table.Cell class="text-right tabular-nums">{p.to - p.from} s</Table.Cell><Table.Cell class="text-right tabular-nums">{short(p.party)}</Table.Cell>
            <Table.Cell class="text-right font-semibold tabular-nums">{me ? short(p.you) : "—"}</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root></div>{/if}
    {/if}

    {#if tab === "damage" && range}
      <div class="flex items-center gap-2 px-4 text-sm"><span class="font-medium tabular-nums">{span(range[0], range[1])}</span>
        <span class="text-muted-foreground">({range[1] - range[0]} s, the chart's {windowRows.length} biggest players)</span><span class="grow"></span>
        <Button variant="ghost" size="sm" onclick={() => { range = null; }}>Whole fight</Button></div>
      {#if windowRows.length}<div class="px-2"><Table.Root>
        <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head class="text-muted-foreground">Player</Table.Head>
          <Table.Head class="text-right text-muted-foreground">Damage</Table.Head><Table.Head class="text-right text-muted-foreground">DPS</Table.Head>
          <Table.Head class="text-right text-muted-foreground">Share</Table.Head></Table.Row></Table.Header>
        <Table.Body>{#each windowRows as x (x.name)}{@const r = x.row}
          <Table.Row class="bar-row border-0" style="--p: {Math.min(1, x.share / 100)}; {r && classColor(r.job) ? `--cls: ${classColor(r.job)}` : ''}">
            <Table.Cell><span class="flex items-center gap-2">{#if r && classIcon(r.job)}<img class="size-5 object-contain" src={classIcon(r.job)} alt={r.job} title={r.job}>{:else}<span class="size-5"></span>{/if}
              <span class="font-medium {r?.isYou ? 'text-primary' : ''}">{x.name}</span></span></Table.Cell>
            <Table.Cell class="text-right tabular-nums">{short(x.damage)}</Table.Cell><Table.Cell class="text-right font-semibold tabular-nums">{short(x.perSec)}</Table.Cell>
            <Table.Cell class="text-right tabular-nums">{x.share.toFixed(1)}%</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root></div>
      {:else}<div class="px-4"><Empty>No damage in those seconds.</Empty></div>{/if}

    {:else if tab === "damage" || tab === "healing" || tab === "taken"}
      {#if rows.length}<div class="px-2"><Table.Root>
        <Table.Header><Table.Row class="hover:bg-transparent">
          <Table.Head class="w-8"></Table.Head><Table.Head class="text-muted-foreground">Player</Table.Head>
          <Table.Head class="text-right text-muted-foreground">{tab === "healing" ? "Healing" : tab === "taken" ? "Taken" : "Damage"}</Table.Head>
          <Table.Head class="text-right text-muted-foreground">{tab === "healing" ? "HPS" : tab === "taken" ? "Taken/s" : "DPS"}</Table.Head>
          <Table.Head class="text-right text-muted-foreground">Share</Table.Head>
          {#if tab === "damage"}<Table.Head class="text-right" title="How much of the fight the player spent hitting the boss (a gap of more than 2 s between hits is time not hitting)">Active</Table.Head><Table.Head class="text-right text-muted-foreground">Crit</Table.Head><Table.Head class="text-right text-muted-foreground">Hits</Table.Head>{/if}
        </Table.Row></Table.Header>
        <Table.Body>{#each rows as { row: r, value, perSec, share } (r.id)}
          <Table.Row class="bar-row cursor-pointer border-0 {tab === 'healing' ? 'heal' : tab === 'taken' ? 'taken' : ''}"
            style="--p: {Math.min(1, share / 100)}; {classColor(r.job) && tab === 'damage' ? `--cls: ${classColor(r.job)}` : ''}"
            tabindex={0} aria-expanded={who === r.id} onclick={() => { who = who === r.id ? null : r.id; }}>
            <Table.Cell class="w-8 text-muted-foreground"><ChevronRight class="size-4 transition-transform {who === r.id ? 'rotate-90' : ''}" /></Table.Cell>
            <Table.Cell><span class="flex items-center gap-2">{#if classIcon(r.job)}<img class="size-5 object-contain" src={classIcon(r.job)} alt={r.job} title={r.job}>{:else}<span class="size-5"></span>{/if}
              <span class="font-medium {r.isYou ? 'text-primary' : ''}">{displayName(r)}</span></span></Table.Cell>
            <Table.Cell class="text-right tabular-nums">{short(value)}</Table.Cell>
            <Table.Cell class="text-right font-semibold tabular-nums">{short(perSec)}</Table.Cell>
            <Table.Cell class="text-right tabular-nums">{share.toFixed(1)}%</Table.Cell>
            {#if tab === "damage"}<Table.Cell class="text-right">{activeText(r, f.battleTimeMs)}</Table.Cell><Table.Cell class="text-right tabular-nums">{r.critRate != null ? Math.round(r.critRate * 100) + "%" : "–"}</Table.Cell>
              <Table.Cell class="text-right tabular-nums">{r.hits ?? "–"}</Table.Cell>{/if}
          </Table.Row>
          {#if who === r.id}<Table.Row class="hover:bg-transparent"><Table.Cell colspan={8} class="bg-muted/40 p-3 whitespace-normal"><PlayerDetail row={r} ms={f.battleTimeMs}
            noSkills="No skill breakdown: fights from before this version kept only your own skills." /></Table.Cell></Table.Row>{/if}
        {/each}</Table.Body></Table.Root></div>
        <p class="hint px-4">Click a player for their stats, every skill (damage, hits, crit) and their buffs with uptime, scrolls and food included.</p>
      {:else}<div class="px-4"><Empty>{tab === "healing" ? "No healing in this fight." : tab === "taken" ? "No damage taken kept for this fight." : "No damage kept for this fight."}</Empty></div>{/if}

    {:else if tab === "deaths"}
      {#if deaths.length}<div class="px-2"><Table.Root>
        <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head class="text-muted-foreground">Time</Table.Head><Table.Head class="text-muted-foreground">Player</Table.Head>
          <Table.Head class="text-right text-muted-foreground">Dead for</Table.Head></Table.Row></Table.Header>
        <Table.Body>{#each deaths as d}<Table.Row>
          <Table.Cell class="tabular-nums text-taken">{clock(d.ms)}</Table.Cell>
          <Table.Cell><span class="flex items-center gap-2">{#if classIcon(d.r.job)}<img class="size-5 object-contain" src={classIcon(d.r.job)} alt={d.r.job}>{/if}{displayName(d.r)}</span></Table.Cell>
          <Table.Cell class="text-right tabular-nums">{d.back != null ? `${Math.round((d.back - d.ms) / 1000)} s` : `${Math.round((f.battleTimeMs - d.ms) / 1000)} s, not revived`}</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root></div>
      {:else}<div class="px-4"><Empty>No deaths kept for this fight.</Empty></div>{/if}

    {:else if tab === "timeline" && f.timeline}<div class="px-4"><Timeline runs={[{ label: "", t: f.timeline }]} /></div>

    {:else if tab === "skills" && me}<div class="px-2"><Table.Root>
      <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head class="text-muted-foreground">Skill</Table.Head><Table.Head class="text-right text-muted-foreground">Damage</Table.Head>
        <Table.Head class="text-right text-muted-foreground">Share</Table.Head><Table.Head class="text-right text-muted-foreground">Hits</Table.Head>
        <Table.Head class="text-right text-muted-foreground">Used</Table.Head><Table.Head class="text-right text-muted-foreground">Crit</Table.Head></Table.Row></Table.Header>
      <Table.Body>{#each me.skills as s (s.name)}<Table.Row class="bar-row border-0" style="--p: {s.share}; {classColor(me.job) ? `--cls: ${classColor(me.job)}` : ''}">
        <Table.Cell><span class="flex items-center gap-2">{#if s.icon}<img class="size-5 rounded" src={skillIconUrl(s.icon)} alt="" loading="lazy">{:else}<span class="size-5 rounded bg-secondary"></span>{/if}{s.name}{#if s.dot}<span class="text-xs text-muted-foreground">DoT</span>{/if}</span></Table.Cell>
        <Table.Cell class="text-right tabular-nums">{short(s.damage)}</Table.Cell><Table.Cell class="text-right tabular-nums">{(s.share * 100).toFixed(1)}%</Table.Cell>
        <Table.Cell class="text-right tabular-nums">{s.hits}</Table.Cell><Table.Cell class="text-right tabular-nums">{s.dot || s.casts == null ? "–" : s.casts}</Table.Cell>
        <Table.Cell class="text-right tabular-nums">{s.dot ? "–" : Math.round(s.critRate * 100) + "%"}</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root></div>
    {/if}
  </Card.Root>

{:else}
<Intro><p>Every boss fight of at least 10 s is kept when the meter resets it (idle, Reset, or a new target).
  Skill breakdowns are kept for you only. Tick two fights to compare them. Open a fight for the party's damage second by second,
  deaths, and your DPS timeline: the best 10 s, the opener, and the seconds you dealt no damage.</p></Intro>

{#if !ui.fights.length}<Empty>No fight yet. Keep the companion open while you fight a boss.</Empty>
{:else}
  <div class="my-3 flex flex-wrap items-center gap-2 text-sm">
    <span class="text-muted-foreground">Boss</span>
    <NativeSelect size="sm" bind:value={boss}><NativeSelectOption value="">All bosses</NativeSelectOption>{#each bossNames as b}<NativeSelectOption value={b}>{b}</NativeSelectOption>{/each}</NativeSelect>
    {#if chars.length > 1}<span class="ml-2 text-muted-foreground">Character</span>
      <NativeSelect size="sm" bind:value={char}><NativeSelectOption value="">All</NativeSelectOption>{#each chars as c}<NativeSelectOption value={c}>{c}</NativeSelectOption>{/each}</NativeSelect>{/if}
  </div>

  {#if pair.length === 2}{@const [a, b] = pair}<SkillCompare {a} {b} title="{a.boss === b.boss ? a.boss : `${a.boss} vs ${b.boss}`}: {when(a.endMs)} → {when(b.endMs)}"
    onclear={() => { picked = []; }} />
    {#if a.timeline && b.timeline}<Timeline runs={[{ label: "Before", t: a.timeline }, { label: "After", t: b.timeline }]} />{/if}{/if}

  <Card.Root class="mb-3 gap-2 pb-3">
    <Card.Header><Card.Title><button type="button" data-slot="fold" class="inline-flex items-center gap-1.5" aria-expanded={bestsOpen} aria-controls="dpslog-bests" onclick={foldBests}>
      <ChevronRight class="size-4 transition-transform {bestsOpen ? 'rotate-90' : ''}" />Personal bests <span class="text-sm font-normal text-muted-foreground">{bests.length}</span></button></Card.Title></Card.Header>
    {#if bestsOpen}<div class="px-2" id="dpslog-bests"><Table.Root>
      <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head class="text-muted-foreground">Boss</Table.Head><Table.Head class="text-right text-muted-foreground">Fights</Table.Head>
        <Table.Head class="text-right text-muted-foreground">Kills</Table.Head><Table.Head class="text-right text-muted-foreground">Best DPS</Table.Head>
        <Table.Head class="text-right text-muted-foreground">Fastest kill</Table.Head><Table.Head class="text-muted-foreground">Trend</Table.Head></Table.Row></Table.Header>
      <Table.Body>{#each bests as [name, b] (name)}{@const line = spark(name)}<Table.Row>
        <Table.Cell class="font-medium">{name}</Table.Cell><Table.Cell class="text-right tabular-nums">{b.fights}</Table.Cell><Table.Cell class="text-right tabular-nums">{b.kills}</Table.Cell>
        <Table.Cell class="text-right tabular-nums">{#if b.dps}<button type="button" data-slot="link" class="hover:underline" onclick={() => openFight(b.dps!.id)}>{short(yourDps(b.dps))}/s</button> <span class="text-xs text-muted-foreground">{when(b.dps.endMs)}</span>{:else}—{/if}</Table.Cell>
        <Table.Cell class="text-right tabular-nums">{#if b.fastest}<button type="button" data-slot="link" class="hover:underline" onclick={() => openFight(b.fastest!.id)}>{clock(b.fastest.battleTimeMs)}</button> <span class="text-xs text-muted-foreground">{when(b.fastest.endMs)}</span>{:else}—{/if}</Table.Cell>
        <Table.Cell>{#if line}<svg class="spark" viewBox="0 0 80 20" width="80" height="20" aria-label="Your DPS over time"><polyline points={line} /></svg>{/if}</Table.Cell></Table.Row>{/each}</Table.Body>
    </Table.Root></div>{/if}
  </Card.Root>

  <Card.Root class="gap-2 pb-3">
    <Card.Header><Card.Title>Fights <span class="ml-1 text-sm font-normal text-muted-foreground">{list.length}</span></Card.Title></Card.Header>
    <div class="px-2"><Table.Root>
      <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head class="w-8"></Table.Head><Table.Head class="text-muted-foreground">When</Table.Head>
        <Table.Head class="text-muted-foreground">Boss</Table.Head><Table.Head class="text-right text-muted-foreground">Time</Table.Head><Table.Head class="text-right">Boss HP</Table.Head>
        <Table.Head class="text-right text-muted-foreground">Your DPS</Table.Head><Table.Head class="text-right text-muted-foreground">Party</Table.Head></Table.Row></Table.Header>
      <Table.Body>{#each list as x (x.id)}{@const mine = you(x)}
        <Table.Row class="bar-row cursor-pointer border-0" style="--p: {mine ? mine.share / 100 : 0}; {mine && classColor(mine.job) ? `--cls: ${classColor(mine.job)}` : ''}"
          tabindex={0} aria-expanded={false} onclick={() => openFight(x.id)}>
          <Table.Cell class="w-8"><Checkbox aria-label="Compare" checked={picked.includes(x.id)} onclick={(e) => { e.stopPropagation(); pick(x.id); }} /></Table.Cell>
          <Table.Cell class="tabular-nums text-muted-foreground">{when(x.endMs)}</Table.Cell>
          <Table.Cell><span class="font-medium">{x.boss}</span> {#if x.killed}<Badge variant="secondary" class="ml-1 text-hps">Killed</Badge>{/if}
            <span class="ml-1 text-xs text-muted-foreground">{[where(x), x.char].filter(Boolean).join(" · ")}</span></Table.Cell>
          <Table.Cell class="text-right tabular-nums">{clock(x.battleTimeMs)}</Table.Cell><Table.Cell class="text-right {x.killed ? 'text-hps' : 'text-muted-foreground'}">{hp(x)}</Table.Cell>
          <Table.Cell class="text-right font-semibold tabular-nums">{mine ? `${short(mine.dps)}/s` : "—"}</Table.Cell>
          <Table.Cell class="text-right tabular-nums">{x.rows.length}</Table.Cell></Table.Row>
      {/each}</Table.Body></Table.Root></div>
  </Card.Root>
{/if}
{/if}

<style>
  .spark polyline { fill: none; stroke: var(--primary); stroke-width: 1.5; }
</style>
