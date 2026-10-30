<script lang="ts">
  import { classIcon } from "../classes.ts";
  import { mapLabel } from "../../domain/arena.ts";
  import { compareSkills, fightText, personalBests, you, yourDps, type FightRecord } from "../../domain/fights.ts";
  import { classColor, clock, displayName, short, skillIconUrl } from "../../domain/meter.ts";
  import { saveFights } from "../../infra/fights.ts";
  import { hm } from "../format.ts";
  import { showStatus } from "../overlays.ts";
  import { fightsSnapshot, ui } from "../state.svelte.ts";

  let boss = $state(""), char = $state(""), open = $state(""), picked = $state<string[]>([]);
  const bossNames = $derived([...new Set(ui.fights.map((f) => f.boss))].sort());
  const chars = $derived([...new Set(ui.fights.map((f) => f.char).filter(Boolean))].sort());
  const list = $derived(ui.fights.filter((f) => (!boss || f.boss === boss) && (!char || f.char === char)));
  const bests = $derived(Object.entries(personalBests(list)).sort(([a], [b]) => a.localeCompare(b)));
  // The two fights to compare, older first.
  const pair = $derived(picked.map((id) => ui.fights.find((f) => f.id === id)).filter((f): f is FightRecord => !!f).sort((a, b) => a.endMs - b.endMs));
  const diff = $derived(pair.length === 2 ? compareSkills(pair[0], pair[1]) : []);

  const when = (t: number) => `${new Date(t).toLocaleDateString([], { day: "2-digit", month: "short" })} ${hm(t)}`;
  const pct = (a: number, b: number) => (a ? `${b >= a ? "+" : ""}${Math.round((b / a - 1) * 100)}%` : "new");
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
    saveFights(fightsSnapshot()).catch((e) => console.warn("Fight Log not saved", e));
  }
  const copy = (f: FightRecord) => navigator.clipboard.writeText(fightText(f)).then(() => showStatus("Fight copied"), () => showStatus("Copy failed"));
</script>

<p class="hint dps-note">Every boss fight of at least 10 s is kept when the meter resets it (idle, Reset, or a new target).
  Skill breakdowns are kept for you only. Tick two fights to compare them.</p>

{#if !ui.fights.length}<section class="empty-fight"><p class="hint">No fight yet. Keep the companion open while you fight a boss.</p></section>
{:else}
  <div class="toolbar">
    <label>Boss <select bind:value={boss}><option value="">All bosses</option>{#each bossNames as b}<option>{b}</option>{/each}</select></label>
    {#if chars.length > 1}<label>Character <select bind:value={char}><option value="">All</option>{#each chars as c}<option>{c}</option>{/each}</select></label>{/if}
  </div>

  {#if pair.length === 2}{@const [a, b] = pair}<section class="dps-table"><h2>{a.boss === b.boss ? a.boss : `${a.boss} vs ${b.boss}`}: {when(a.endMs)} → {when(b.endMs)}
      <button class="ghost" onclick={() => { picked = []; }}>Clear</button></h2>
    <div class="scroll"><table class="sheet">
      <thead><tr><th></th><th class="n">Before</th><th class="n">After</th><th class="n">Change</th></tr></thead>
      <tbody>
        <tr><td>Your DPS</td><td class="n">{short(yourDps(a))}/s</td><td class="n">{short(yourDps(b))}/s</td><td class="n delta" class:up={yourDps(b) >= yourDps(a)}>{pct(yourDps(a), yourDps(b))}</td></tr>
        <tr><td>Time</td><td class="n">{clock(a.battleTimeMs)}</td><td class="n">{clock(b.battleTimeMs)}</td><td class="n delta" class:up={b.battleTimeMs <= a.battleTimeMs}>{pct(a.battleTimeMs, b.battleTimeMs)}</td></tr>
        <tr><td>Combat power</td><td class="n">{a.combatPower ? short(a.combatPower) : "—"}</td><td class="n">{b.combatPower ? short(b.combatPower) : "—"}</td><td></td></tr>
      </tbody></table>
    {#if diff.length}<table class="sheet">
      <thead><tr><th>Skill</th><th class="n">Before /s</th><th class="n">After /s</th><th class="n">Change</th><th class="n">Hits</th><th class="n">Crit</th></tr></thead>
      <tbody>{#each diff as d (d.name)}<tr>
        <td class="skill-name">{#if d.icon}<img class="skill-icon" src={skillIconUrl(d.icon)} alt="" loading="lazy" width="20" height="20">{:else}<span class="skill-icon none" aria-hidden="true"></span>{/if}{d.name}{#if d.dot}<span class="dim">DoT</span>{/if}</td>
        <td class="n">{short(d.dpsA)}</td><td class="n">{short(d.dpsB)}</td><td class="n delta" class:up={d.dpsB >= d.dpsA}>{pct(d.dpsA, d.dpsB)}</td>
        <td class="n">{d.a?.hits ?? 0} → {d.b?.hits ?? 0}</td>
        <td class="n">{d.dot ? "–" : `${Math.round((d.a?.critRate ?? 0) * 100)}% → ${Math.round((d.b?.critRate ?? 0) * 100)}%`}</td></tr>{/each}</tbody></table>
    {:else}<p class="hint">No skill data in these fights.</p>{/if}</div></section>{/if}

  <section class="dps-table"><h2>Personal bests</h2><div class="scroll"><table class="sheet">
    <thead><tr><th>Boss</th><th class="n">Fights</th><th class="n">Kills</th><th class="n">Best DPS</th><th class="n">Fastest kill</th><th>Trend</th></tr></thead>
    <tbody>{#each bests as [name, b] (name)}{@const line = spark(name)}<tr>
      <td><span class="name">{name}</span></td><td class="n">{b.fights}</td><td class="n">{b.kills}</td>
      <td class="n">{#if b.dps}{short(yourDps(b.dps))}/s <small class="dim">{when(b.dps.endMs)}</small>{:else}—{/if}</td>
      <td class="n">{#if b.fastest}{clock(b.fastest.battleTimeMs)} <small class="dim">{when(b.fastest.endMs)}</small>{:else}—{/if}</td>
      <td>{#if line}<svg class="spark" viewBox="0 0 80 20" width="80" height="20" aria-label="Your DPS over time"><polyline points={line} /></svg>{/if}</td></tr>{/each}</tbody>
  </table></div></section>

  <section class="dps-table"><h2>Fights <span class="count">{list.length}</span></h2><div class="scroll"><table class="sheet">
    <thead><tr><th></th><th>When</th><th>Boss</th><th class="n">Time</th><th class="n">Your DPS</th><th class="n">Party</th></tr></thead>
    <tbody>{#each list as f (f.id)}{@const me = you(f)}
      <tr class="prow" class:you={!!me} style:--p={String(me ? me.share / 100 : 0)} aria-expanded={open === f.id} onclick={() => { open = open === f.id ? "" : f.id; }}>
        <td><input type="checkbox" aria-label="Compare" checked={picked.includes(f.id)} onclick={(e) => { e.stopPropagation(); pick(f.id); }}></td>
        <td>{when(f.endMs)}</td>
        <td><span class="name">{f.boss}</span><small>{[f.killed ? "killed" : "not killed", where(f), f.char].filter(Boolean).join(" · ")}</small></td>
        <td class="n">{clock(f.battleTimeMs)}</td><td class="n">{me ? `${short(me.dps)}/s` : "—"}</td><td class="n">{f.rows.length}</td></tr>
      {#if open === f.id}<tr class="skills"><td colspan="6">
        <div class="toolbar"><button onclick={() => copy(f)}>Copy as text</button><button class="ghost" onclick={() => remove(f.id)}>Delete</button></div>
        <table class="sheet">
          <thead><tr><th>Player</th><th class="n">DPS</th><th class="n">Damage</th><th class="n">Share</th><th class="n">Healing</th></tr></thead>
          <tbody>{#each [...f.rows].sort((p, q) => q.damage - p.damage) as r (r.id)}<tr class:you={r.isYou} style:--cls={classColor(r.job) || null}>
            <td>{#if classIcon(r.job)}<img class="cls-icon" src={classIcon(r.job)} alt={r.job} title={r.job} width="22" height="23">{/if}<span class="name">{displayName(r)}</span>{#if r.job}<small>{r.job}</small>{/if}</td>
            <td class="n">{short(r.dps)}/s</td><td class="n">{short(r.damage)}</td><td class="n">{r.share.toFixed(1)}%</td><td class="n">{r.heal ? short(r.heal) : "—"}</td></tr>{/each}</tbody></table>
        {#if me?.skills.length}<table class="sheet">
          <thead><tr><th>Your skill</th><th class="n">Damage</th><th class="n">Share</th><th class="n">Hits</th><th class="n">Crit</th></tr></thead>
          <tbody>{#each me.skills as s (s.name)}<tr><td class="skill-name">{#if s.icon}<img class="skill-icon" src={skillIconUrl(s.icon)} alt="" loading="lazy" width="20" height="20">{:else}<span class="skill-icon none" aria-hidden="true"></span>{/if}{s.name}{#if s.dot}<span class="dim">DoT</span>{/if}</td>
            <td class="n">{short(s.damage)}</td><td class="n">{(s.share * 100).toFixed(1)}%</td><td class="n">{s.hits}</td><td class="n">{s.dot ? "–" : Math.round(s.critRate * 100) + "%"}</td></tr>{/each}</tbody></table>{/if}
      </td></tr>{/if}
    {/each}</tbody></table></div></section>
{/if}

<style>
  .toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
  .delta { color: var(--negative); }
  .delta.up { color: var(--positive); }
  .spark polyline { fill: none; stroke: var(--accent); stroke-width: 1.5; }
  h2 button { margin-left: 8px; font-size: 12px; }
</style>
