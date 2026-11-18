<script lang="ts">
  // Boss fights the members shared: per boss, each member's best DPS and fastest kill; two runs side by side;
  // the pulls several members recorded, as one fight with everyone's own numbers.
  import { untrack } from "svelte";
  import { bossFights, fightBosses } from "../../../app/guild.ts";
  import { yourDps, type FightRecord } from "../../../domain/fights.ts";
  import { groupPulls, memberBests } from "../../../domain/guild.ts";
  import { classColor, clock, displayName, short, skillIconUrl } from "../../../domain/meter.ts";
  import { classIcon } from "../../classes.ts";
  import { hm } from "../../format.ts";
  import PlayerStats from "../../parts/PlayerStats.svelte";
  import SkillCompare from "../../parts/SkillCompare.svelte";
  import { ui } from "../../state.svelte.ts";
  import { gs, say } from "./run.svelte.ts";

  let bosses = $state<{ boss: string; n: number }[]>([]), boss = $state(""), fights = $state<FightRecord[]>([]), picked = $state<string[]>([]);
  $effect(() => { untrack(() => fightBosses(ui.data).then((b) => { bosses = b; if (!boss && b[0]) boss = b[0].boss; }).catch((e) => { gs.error = say(e); })); });
  $effect(() => {
    const b = boss;
    if (b) untrack(() => { picked = []; bossFights(ui.data, b).then((f) => { fights = f; }).catch((e) => { gs.error = say(e); }); });
  });
  const bests = $derived(memberBests(fights));
  const pulls = $derived(groupPulls(fights));
  let open = $state(""), who = $state("");
  const when = (t: number) => `${new Date(t).toLocaleDateString([], { day: "2-digit", month: "short" })} ${hm(t)}`;
  const pair = $derived(picked.map((id) => fights.find((f) => f.id === id)).filter((f): f is FightRecord => !!f));
  const pick = (id: string) => { picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(-2); };
</script>

<section><h2>Shared fights</h2>
  {#if !bosses.length}<p class="hint">No fight shared yet. Members who tick "Share my boss fights" (My settings) send each boss fight their meter logs.</p>
  {:else}
    <label class="toolbar start">Boss <select bind:value={boss}>{#each bosses as b (b.boss)}<option value={b.boss}>{b.boss} ({b.n})</option>{/each}</select></label>
    <div class="scroll"><table class="sheet">
      <thead><tr><th>Member</th><th class="n">Fights</th><th class="n">Best DPS</th><th class="n">Fastest kill</th></tr></thead>
      <tbody>{#each bests as b (b.char)}<tr>
        <td><span class="name">{b.char || "Unknown"}</span></td><td class="n">{b.fights}</td>
        <td class="n">{#if b.dps}<label><input type="checkbox" aria-label="Compare" checked={picked.includes(b.dps.id)} onchange={() => pick(b.dps!.id)}> {short(yourDps(b.dps))}/s</label>{:else}—{/if}</td>
        <td class="n">{b.fastest ? clock(b.fastest.battleTimeMs) : "—"}</td></tr>{/each}</tbody></table></div>
    <p class="hint">Tick two best runs to compare their skills.</p>
  {/if}
</section>
{#if pair.length === 2}{@const [a, b] = pair}<SkillCompare {a} {b} title="{boss}: {a.char} vs {b.char}" labelA={a.char} labelB={b.char} dpsLabel="DPS"
  onclear={() => { picked = []; }} />{/if}

{#if pulls.length}<section class="dps-table"><h2>Pulls <span class="count">{pulls.length}</span></h2><div class="scroll"><table class="sheet">
  <thead><tr><th>When</th><th class="n">Time</th><th>Recorded by</th><th class="n">Players</th></tr></thead>
  <tbody>{#each pulls as p (p.id)}
    <tr class="prow" tabindex="0" aria-expanded={open === p.id} onclick={() => { open = open === p.id ? "" : p.id; who = ""; }}
      onkeydown={(e) => { if (e.key === "Enter") { open = open === p.id ? "" : p.id; who = ""; } }}>
      <td>{when(p.endMs)}<small>{p.killed ? "killed" : "not killed"}</small></td><td class="n">{clock(p.battleTimeMs)}</td>
      <td>{p.chars.join(", ") || "Unknown"}</td><td class="n">{p.rows.length}</td></tr>
    {#if open === p.id}<tr class="skills"><td colspan="4"><table class="sheet">
      <thead><tr><th>Player</th><th class="n">DPS</th><th class="n">Damage</th><th class="n">Share</th><th class="n">Deaths</th></tr></thead>
      <tbody>{#each p.rows as { row: r, own } (r.name || r.id)}{@const key = r.name || String(r.id)}
        <tr class="prow" tabindex="0" class:you={own} style:--cls={classColor(r.job) || null} aria-expanded={who === key}
          onclick={() => { who = who === key ? "" : key; }} onkeydown={(e) => { if (e.key === "Enter") who = who === key ? "" : key; }}>
          <td>{#if classIcon(r.job)}<img class="cls-icon" src={classIcon(r.job)} alt={r.job} title={r.job} width="22" height="23">{/if}<span class="name">{displayName(r)}</span>
            <small>{[r.job, own ? "own record" : "as a member saw them"].filter(Boolean).join(" · ")}</small></td>
          <td class="n">{short(r.dps)}/s</td><td class="n">{short(r.damage)}</td><td class="n">{r.share.toFixed(1)}%</td><td class="n">{r.deaths ?? "—"}</td></tr>
        {#if who === key}<tr class="skills"><td colspan="5"><PlayerStats row={r} ms={p.battleTimeMs} />
          {#if r.skills.length}<table class="sheet">
            <thead><tr><th>Skill</th><th class="n">Damage</th><th class="n">Share</th><th class="n">Hits</th><th class="n">Used</th><th class="n">Crit</th></tr></thead>
            <tbody>{#each r.skills as s (s.name)}<tr><td class="skill-name">{#if s.icon}<img class="skill-icon" src={skillIconUrl(s.icon)} alt="" loading="lazy" width="20" height="20">{:else}<span class="skill-icon none" aria-hidden="true"></span>{/if}{s.name}{#if s.dot}<span class="dim">DoT</span>{/if}</td>
              <td class="n">{short(s.damage)}</td><td class="n">{(s.share * 100).toFixed(1)}%</td><td class="n">{s.hits}</td><td class="n">{s.dot || s.casts == null ? "–" : s.casts}</td><td class="n">{s.dot ? "–" : Math.round(s.critRate * 100) + "%"}</td></tr>{/each}</tbody></table>
          {:else}<p class="hint">Skills only from a player's own record: they did not share this fight.</p>{/if}</td></tr>{/if}
      {/each}</tbody></table></td></tr>{/if}
  {/each}</tbody></table></div>
  <p class="hint">Fights of the same boss that members recorded at the same time are one pull. Each player's numbers come from their own record when they shared it.
    Click a player for hits, crits, healing, deaths (and when) and damage taken.</p></section>{/if}
