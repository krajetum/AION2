<script lang="ts">
  // A player clicked in a boss fight: advanced stats, every skill (damage, hits, casts, crit), buffs with their uptime.
  import { short, skillIconUrl, type PlayerRow } from "../../domain/meter.ts";
  import BuffList from "./BuffList.svelte";
  import PlayerStats from "./PlayerStats.svelte";

  let { row, ms, noSkills = "No skill breakdown for this player in this fight." }: { row: PlayerRow; ms: number; noSkills?: string } = $props();
  const sec = $derived(Math.max(1, ms / 1000));
</script>

<PlayerStats {row} {ms} />

<h3 class="sub">Skills</h3>
{#if row.skills.length}<table class="sheet">
  <thead><tr><th>Skill</th><th class="n">Damage</th><th class="n">DPS</th><th class="n">Share</th><th class="n">Hits</th><th class="n" title="Times used: a hit more than 400 ms after the last one of that skill">Used</th><th class="n">Crit</th><th class="n">Avg hit</th></tr></thead>
  <tbody>{#each row.skills as s (s.name)}<tr>
    <td class="skill-name">{#if s.icon}<img class="skill-icon" src={skillIconUrl(s.icon)} alt="" loading="lazy" width="20" height="20">{:else}<span class="skill-icon none" aria-hidden="true"></span>{/if}{s.name}{#if s.dot}<span class="dim">DoT</span>{/if}</td>
    <td class="n">{short(s.damage)}</td><td class="n">{short(s.damage / sec)}/s</td><td class="n">{(s.share * 100).toFixed(1)}%</td><td class="n">{s.hits}</td>
    <td class="n">{s.dot || s.casts == null ? "–" : s.casts}</td><td class="n">{s.dot ? "–" : Math.round(s.critRate * 100) + "%"}</td>
    <td class="n">{s.hits ? short(s.damage / s.hits) : "–"}</td></tr>{/each}</tbody></table>
{:else}<p class="hint">{noSkills}</p>{/if}

<BuffList {row} {ms} />

<style>
  .sub { font-size: var(--fs-sm); color: var(--muted); margin: 10px 0 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
</style>
