<script lang="ts">
  // Two fights side by side: DPS, time, combat power, then the played character's skills per second (compareSkills).
  // Fight Log: two of your runs (Before / After); Guild page: two members' runs (their names).
  import { compareSkills, yourDps, type FightRecord } from "../../domain/fights.ts";
  import { clock, short, skillIconUrl } from "../../domain/meter.ts";

  let { a, b, title, labelA = "Before", labelB = "After", dpsLabel = "Your DPS", onclear }:
    { a: FightRecord; b: FightRecord; title: string; labelA?: string; labelB?: string; dpsLabel?: string; onclear: () => void } = $props();
  const diff = $derived(compareSkills(a, b));
  const pct = (x: number, y: number) => (x ? `${y >= x ? "+" : ""}${Math.round((y / x - 1) * 100)}%` : "new");
</script>

<section class="dps-table"><h2>{title} <button class="ghost" onclick={onclear}>Clear</button></h2>
  <div class="scroll"><table class="sheet">
    <thead><tr><th></th><th class="n">{labelA}</th><th class="n">{labelB}</th><th class="n">Change</th></tr></thead>
    <tbody>
      <tr><td>{dpsLabel}</td><td class="n">{short(yourDps(a))}/s</td><td class="n">{short(yourDps(b))}/s</td><td class="n delta" class:up={yourDps(b) >= yourDps(a)}>{pct(yourDps(a), yourDps(b))}</td></tr>
      <tr><td>Time</td><td class="n">{clock(a.battleTimeMs)}</td><td class="n">{clock(b.battleTimeMs)}</td><td class="n delta" class:up={b.battleTimeMs <= a.battleTimeMs}>{pct(a.battleTimeMs, b.battleTimeMs)}</td></tr>
      <tr><td>Combat power</td><td class="n">{a.combatPower ? short(a.combatPower) : "—"}</td><td class="n">{b.combatPower ? short(b.combatPower) : "—"}</td><td></td></tr>
    </tbody></table>
  {#if diff.length}<table class="sheet">
    <thead><tr><th>Skill</th><th class="n">{labelA} /s</th><th class="n">{labelB} /s</th><th class="n">Change</th><th class="n">Hits</th><th class="n">Crit</th></tr></thead>
    <tbody>{#each diff as d (d.name)}<tr>
      <td class="skill-name">{#if d.icon}<img class="skill-icon" src={skillIconUrl(d.icon)} alt="" loading="lazy" width="20" height="20">{:else}<span class="skill-icon none" aria-hidden="true"></span>{/if}{d.name}{#if d.dot}<span class="dim">DoT</span>{/if}</td>
      <td class="n">{short(d.dpsA)}</td><td class="n">{short(d.dpsB)}</td><td class="n delta" class:up={d.dpsB >= d.dpsA}>{pct(d.dpsA, d.dpsB)}</td>
      <td class="n">{d.a?.hits ?? 0} → {d.b?.hits ?? 0}</td>
      <td class="n">{d.dot ? "–" : `${Math.round((d.a?.critRate ?? 0) * 100)}% → ${Math.round((d.b?.critRate ?? 0) * 100)}%`}</td></tr>{/each}</tbody></table>
  {:else}<p class="hint">No skill data in these fights.</p>{/if}</div></section>

<style>
  .delta { color: var(--negative); }
  .delta.up { color: var(--positive); }
  h2 button { margin-left: 8px; font-size: 12px; }
</style>
