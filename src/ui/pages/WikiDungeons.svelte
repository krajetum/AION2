<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  import { DUNGEONS, VERIFIED, doubt, itemLevelRange, seasonMissions, val, type Kind, type Val } from "../../domain/wiki.ts";
  import { num } from "../format.ts";
  import Kpi from "../parts/Kpi.svelte";

  let { kind }: { kind: Kind } = $props();

  const list = $derived(DUNGEONS.filter((d) => d.kind === kind));
  const key = $derived(`aion2-wiki-${kind}`);
  const remembered = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
  let picked = $state("");
  $effect(() => { picked = remembered(key); });
  function pick(id: string) {
    picked = id;
    try { localStorage.setItem(key, id); } catch { /* not kept */ }
  }
  const d = $derived(list.find((x) => x.id === picked) ?? list[0]);

  const range = (xs: string[]) => { const n = [...new Set(xs)]; return n.length > 1 ? `${n[0]}–${n.at(-1)}` : n[0]; };
  const hard = $derived(d.modes.find((m) => m.frenzy));
  const missions = $derived(seasonMissions(d.name));
  const finalBoss = $derived(d.bosses.find((b) => b.role === "final"));
  const TYPE: Partial<Record<Kind, string>> = { transcendence: "Transcendence", sanctuary: "Sanctuary" };
  const ROLE = { mini: "Mini-boss", gate: "Required", final: "Final boss" };
</script>

{#snippet unsure(why: string | undefined, text = "Unconfirmed")}<Badge variant="secondary" class="text-gold" title={why}>{text}</Badge>{/snippet}
{#snippet v(x: Val | undefined)}{#if x}{val(x)}{#if doubt(x)} {@render unsure(doubt(x))}{/if}{:else}<span class="text-muted-foreground">–</span>{/if}{/snippet}
{#snippet bullets(items: (string | Val)[])}<ul class="m-0 list-disc space-y-1 pl-5 text-sm marker:text-muted-foreground">{#each items as x}<li>{@render v(x)}</li>{/each}</ul>{/snippet}

<ToggleGroup.Root type="single" variant="outline" size="sm" class="mb-3 flex-wrap justify-start" aria-label="Dungeon" value={d.id} onValueChange={(id) => id && pick(id)}>
  {#each list as x (x.id)}<ToggleGroup.Item value={x.id}>{x.name}{x.tier ? ` ${"★".repeat(x.tier)}` : ""}{x.modes.some((m) => m.name === "Hard") ? " · Hard" : ""}</ToggleGroup.Item>{/each}
</ToggleGroup.Root>

<p class="mt-0 mb-3 max-w-[90ch] text-sm text-muted-foreground">{d.summary}</p>
<div class="mb-3 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
  <Kpi label="Item level" value={itemLevelRange(d)} sub={d.modes.map((m) => `${m.name} ${val(m.itemLevel)}`).join(" · ")} cls="hero" />
  <Kpi label="Type" value={TYPE[d.kind] ?? `Conquest ${"★".repeat(d.tier ?? 0)}`} sub={d.modes.map((m) => m.name).join(" · ")} />
  <Kpi label="Character level" value={range(d.modes.map((m) => val(m.level)))} sub="to enter" />
  <Kpi label="Party" value={range(d.modes.map((m) => m.party))} sub="players" />
  <Kpi label="Odyle Energy" value={range(d.modes.map((m) => String(m.odyle ?? "–")))} sub="per reward cube" />
  <Kpi label="Bosses" value={String(d.bosses.length)} sub={finalBoss ? `final: ${val(finalBoss.name)}` : ""} />
  {#if d.kind === "transcendence"}<Kpi label="Rewards" value="Arcana" sub={val(d.other[0]).split(": ")[1]} />
  {:else}<Kpi label="Best gear" value={d.gear[0].split(":")[0]} sub={d.gear[0].split(":")[1]?.trim() ?? ""} />{/if}
  {#if hard}<Kpi label="Hard: Frenzy · revives" value="{val(hard.frenzy!)} · {val(hard.revives!).split(' ')[0]}" sub="boss enrage timer · revives per player" />{/if}
  {#if missions.length}<Kpi label="Season Oath Coins" value={num(missions.reduce((s, m) => s + m.coins, 0))} sub="{missions.length} missions, see below" />{/if}
  {#if d.cp}<Kpi label="Recommended CP" value={val(d.cp).split(" ")[0]}>{val(d.cp).split(" ").slice(1).join(" ")} {@render unsure(doubt(d.cp), "Player reports")}</Kpi>{/if}
</div>

<Panel title="Modes" count={d.modes.length}><Table.Root>
  <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Mode</Table.Head><Table.Head class="text-right">Level</Table.Head><Table.Head class="text-right">Item level</Table.Head><Table.Head class="text-right">Party</Table.Head><Table.Head class="text-right">Odyle</Table.Head><Table.Head>Kina per cube</Table.Head><Table.Head>Guaranteed reward</Table.Head></Table.Row></Table.Header>
  <Table.Body>{#each d.modes as m (m.name)}<Table.Row><Table.Cell class="font-medium">{m.name}</Table.Cell><Table.Cell class="text-right">{@render v(m.level)}</Table.Cell><Table.Cell class="text-right">{@render v(m.itemLevel)}</Table.Cell>
    <Table.Cell class="text-right">{m.party}</Table.Cell><Table.Cell class="text-right">{m.odyle ?? "–"}</Table.Cell><Table.Cell class="whitespace-normal">{@render v(m.kina)}</Table.Cell><Table.Cell class="whitespace-normal">{@render v(m.guaranteed)}</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
  {#if hard}<p class="hint">Hard: Frenzy {val(hard.frenzy!)}, revives {val(hard.revives!)}, time limit {val(hard.timeLimit ?? "–")}{doubt(hard.timeLimit) ? " (unconfirmed)" : ""}.</p>{/if}</Panel>

<Panel title="Drops by mode"><div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
  {#each d.modes as m (m.name)}<div><h3 class="mt-0 mb-2 text-sm font-semibold">{m.name}</h3>{@render bullets(m.drops)}
    {#if m.changes?.length}<h4 class="mt-3 mb-1.5 text-xs font-semibold text-muted-foreground uppercase">What changes</h4>{@render bullets(m.changes)}{/if}</div>{/each}</div></Panel>

<Panel title="Bosses" count="in route order"><div class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
  {#each d.bosses as b (val(b.name))}<div><h3 class="mt-0 mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">{@render v(b.name)}
      <Badge variant="secondary" class={b.role === "final" ? "text-primary" : b.role === "gate" ? "text-muted-foreground" : "text-hps"}>{ROLE[b.role]}</Badge></h3>
    {@render bullets(b.mechanics)}</div>{/each}</div></Panel>

<div class="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-start gap-x-3"><div>
  <Panel title="Gear">{@render bullets(d.gear)}</Panel>
  <Panel title="Other drops and notes">{@render bullets(d.other)}</Panel></div><div>
  <Panel title="Tips">{@render bullets(d.tips)}</Panel>
  {#if missions.length}<Panel title="Season Oath Coin missions" count={num(missions.reduce((s, m) => s + m.coins, 0))}><Table.Root>
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Mission</Table.Head><Table.Head class="text-right">Steps</Table.Head><Table.Head class="text-right">Coins</Table.Head></Table.Row></Table.Header>
    <Table.Body>{#each missions as m (m.name)}<Table.Row><Table.Cell class="whitespace-normal">{m.name}{#if m.weekly} <Badge variant="secondary">Weekly</Badge>{/if}</Table.Cell><Table.Cell class="text-right">{m.steps}</Table.Cell><Table.Cell class="text-right">{num(m.coins)}</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
    <p class="hint">Tick them on the Season Coins page.</p></Panel>{/if}
</div></div>

<Panel title="Sources" count="checked {VERIFIED}"><ul class="m-0 list-disc space-y-1 pl-5 text-sm">
  {#each d.sources as s (s.name)}<li><a class="text-primary hover:underline" href={s.url} target="_blank" rel="noopener">{s.name} ↗</a> <span class="text-xs text-muted-foreground">{s.date}</span></li>{/each}</ul>
  <p class="hint">Global/EU build. Guides often disagree: "Unconfirmed" values come from one source or differ between sources (hover for details).
    The in-game dungeon window wins over this page.</p></Panel>
