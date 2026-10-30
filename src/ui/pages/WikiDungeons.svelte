<script lang="ts">
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
  const ROLE = { mini: "Mini-boss", gate: "Required", final: "Final boss" };
</script>

{#snippet v(x: Val | undefined)}{#if x}{val(x)}{#if doubt(x)} <span class="pill" title={doubt(x)}>Unconfirmed</span>{/if}{:else}<span class="dim">–</span>{/if}{/snippet}

<div class="seg wiki-pick" role="group" aria-label="Dungeon">
  {#each list as x (x.id)}<button class:on={x.id === d.id} aria-pressed={x.id === d.id} onclick={() => pick(x.id)}>
    {x.name}{x.tier ? ` ${"★".repeat(x.tier)}` : ""}{x.modes.some((m) => m.name === "Hard") ? " · Hard" : ""}</button>{/each}
</div>

<p class="wiki-summary">{d.summary}</p>
<div class="kpis">
  <Kpi label="Item level" value={itemLevelRange(d)} sub={d.modes.map((m) => `${m.name} ${val(m.itemLevel)}`).join(" · ")} cls="hero" />
  <Kpi label="Type" value={d.kind === "transcendence" ? "Transcendence" : `Conquest ${"★".repeat(d.tier ?? 0)}`} sub={d.modes.map((m) => m.name).join(" · ")} />
  <Kpi label="Character level" value={range(d.modes.map((m) => val(m.level)))} sub="to enter" />
  <Kpi label="Party" value={range(d.modes.map((m) => m.party))} sub="players" />
  <Kpi label="Odyle Energy" value={range(d.modes.map((m) => String(m.odyle)))} sub="per reward cube" />
  <Kpi label="Bosses" value={String(d.bosses.length)} sub={finalBoss ? `final: ${val(finalBoss.name)}` : ""} />
  {#if d.kind === "transcendence"}<Kpi label="Rewards" value="Arcana" sub={val(d.other[0]).split(": ")[1]} />
  {:else}<Kpi label="Best gear" value={d.gear[0].split(":")[0]} sub={d.gear[0].split(":")[1]?.trim() ?? ""} />{/if}
  {#if hard}<Kpi label="Hard: Frenzy · revives" value="{val(hard.frenzy!)} · {val(hard.revives!).split(' ')[0]}" sub="boss enrage timer · revives per player" />{/if}
  {#if missions.length}<Kpi label="Season Oath Coins" value={num(missions.reduce((s, m) => s + m.coins, 0))} sub="{missions.length} missions, see below" />{/if}
  {#if d.cp}<Kpi label="Recommended CP" value={val(d.cp).split(" ")[0]}>{val(d.cp).split(" ").slice(1).join(" ")} <span class="pill" title={doubt(d.cp)}>Player reports</span></Kpi>{/if}
</div>

<section><h2>Modes <span class="count">{d.modes.length}</span></h2><div class="scroll"><table class="sheet">
  <thead><tr><th>Mode</th><th class="n">Level</th><th class="n">Item level</th><th class="n">Party</th><th class="n">Odyle</th><th>Kina per cube</th><th>Guaranteed reward</th></tr></thead>
  <tbody>{#each d.modes as m (m.name)}<tr><td class="name">{m.name}</td><td class="n">{@render v(m.level)}</td><td class="n">{@render v(m.itemLevel)}</td>
    <td class="n">{m.party}</td><td class="n">{m.odyle}</td><td>{@render v(m.kina)}</td><td>{@render v(m.guaranteed)}</td></tr>{/each}</tbody></table></div>
  {#if hard}<p class="hint">Hard: Frenzy {val(hard.frenzy!)}, revives {val(hard.revives!)}, time limit {val(hard.timeLimit ?? "–")}{doubt(hard.timeLimit) ? " (unconfirmed)" : ""}.</p>{/if}</section>

<section class="wiki"><h2>Drops by mode</h2><div class="wiki-cols">
  {#each d.modes as m (m.name)}<div><h3>{m.name}</h3><ul>{#each m.drops as x}<li>{x}</li>{/each}</ul>
    {#if m.changes?.length}<h4>What changes</h4><ul>{#each m.changes as c}<li>{@render v(c)}</li>{/each}</ul>{/if}</div>{/each}</div></section>

<section class="wiki"><h2>Bosses <span class="count">in route order</span></h2><div class="wiki-cols">
  {#each d.bosses as b (val(b.name))}<div class="boss {b.role}"><h3>{@render v(b.name)} <span class="pill {b.role === 'final' ? 'magenta' : b.role === 'gate' ? 'neutral' : 'teal'}">{ROLE[b.role]}</span></h3>
    <ul>{#each b.mechanics as x}<li>{x}</li>{/each}</ul></div>{/each}</div></section>

<div class="settings"><div>
  <section class="wiki"><h2>Gear</h2><ul>{#each d.gear as x}<li>{x}</li>{/each}</ul></section>
  <section class="wiki"><h2>Other drops and notes</h2><ul>{#each d.other as x}<li>{@render v(x)}</li>{/each}</ul></section></div><div>
  <section class="wiki"><h2>Tips</h2><ul>{#each d.tips as x}<li>{x}</li>{/each}</ul></section>
  {#if missions.length}<section><h2>Season Oath Coin missions <span class="count">{num(missions.reduce((s, m) => s + m.coins, 0))}</span></h2><div class="scroll"><table class="sheet">
    <thead><tr><th>Mission</th><th class="n">Steps</th><th class="n">Coins</th></tr></thead>
    <tbody>{#each missions as m (m.name)}<tr><td>{m.name}{#if m.weekly} <span class="pill neutral">Weekly</span>{/if}</td><td class="n">{m.steps}</td><td class="n">{num(m.coins)}</td></tr>{/each}</tbody></table></div>
    <p class="hint">Tick them on the Season Coins page.</p></section>{/if}
</div></div>

<section class="wiki"><h2>Sources <span class="count">checked {VERIFIED}</span></h2><ul>
  {#each d.sources as s (s.url)}<li><a href={s.url} target="_blank" rel="noopener">{s.name} ↗</a> <span class="dim">{s.date}</span></li>{/each}</ul>
  <p class="hint">Global/EU build. Guides often disagree: "Unconfirmed" values come from one source or differ between sources (hover for details).
    The in-game dungeon window wins over this page.</p></section>
