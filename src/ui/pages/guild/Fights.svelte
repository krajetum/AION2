<script lang="ts">
  // Boss fights the members shared: per boss, each member's best DPS and fastest kill; two runs side by side;
  // the pulls several members recorded, as one fight with everyone's own numbers.
  import { untrack } from "svelte";
  import { bossFights, fightBosses, shareFights } from "../../../app/guild.ts";
  import { yourDps, type FightRecord } from "../../../domain/fights.ts";
  import { groupPulls, isStaticFight, memberBests, STATIC_MIN_MEMBERS, type GuildLink, type GuildView } from "../../../domain/guild.ts";
  import { activeText, classColor, clock, displayName, hpText, short } from "../../../domain/meter.ts";
  import { classIcon } from "../../classes.ts";
  import { hm } from "../../format.ts";
  import { showStatus } from "../../overlays.ts";
  import PlayerDetail from "../../parts/PlayerDetail.svelte";
  import SkillCompare from "../../parts/SkillCompare.svelte";
  import { ui } from "../../state.svelte.ts";
  import { gs, run, say } from "./run.svelte.ts";

  let { g, view }: { g: GuildLink; view: GuildView } = $props();
  const me = $derived(view.members.find((m) => m.me)?.name ?? "");
  const names = $derived(view.members.map((m) => m.name));
  let reload = $state(0);
  const share = () => run(async () => {
    const n = await shareFights(ui.data, ui.fights, me, names);
    reload++;
    showStatus(n ? `Your boss fights are shared (${n} past ${n === 1 ? "fight" : "fights"} sent)` : "Your boss fights are shared");
  });

  let bosses = $state<{ boss: string; n: number }[]>([]), boss = $state(""), all = $state<FightRecord[]>([]), picked = $state<string[]>([]);
  $effect(() => { void reload; untrack(() => fightBosses(ui.data).then((b) => { bosses = b; if (!boss && b[0]) boss = b[0].boss; }).catch((e) => { gs.error = say(e); })); });
  $effect(() => {
    const b = boss;
    void reload;
    if (b) untrack(() => { picked = []; bossFights(ui.data, b).then((f) => { all = f; }).catch((e) => { gs.error = say(e); }); });
  });
  // Only static fights (STATIC_MIN_MEMBERS members in them): a member's other runs stay theirs.
  const fights = $derived(all.filter((f) => isStaticFight(f, names)));
  const bests = $derived(memberBests(fights));
  const pulls = $derived(groupPulls(fights));
  let open = $state(""), who = $state("");
  const when = (t: number) => `${new Date(t).toLocaleDateString([], { day: "2-digit", month: "short" })} ${hm(t)}`;
  const pair = $derived(picked.map((id) => fights.find((f) => f.id === id)).filter((f): f is FightRecord => !!f));
  const pick = (id: string) => { picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(-2); };
</script>

{#if !g.share.fights}<section class="notice"><h2>You don't share your boss fights</h2>
  <p class="hint">The others can't see your fights, and your pulls don't merge with theirs. Sharing sends each boss fight your meter logs
    (DPS, skills, deaths; not the second-by-second timeline) when at least {STATIC_MIN_MEMBERS} of the static's members were in it,
    {me ? `starting with those of the past week as ${me}` : "starting with those of the past week"}. Your other fights stay on your PC. You can stop in My settings.</p>
  <button type="button" class="primary" disabled={gs.busy} onclick={share}>Share my boss fights</button></section>{/if}

<section><h2>Shared fights</h2>
  {#if !bosses.length}<p class="hint">No static fight shared yet: a boss fight with at least {STATIC_MIN_MEMBERS} of the static's members in it, from a member who shares
    their boss fights (My settings, or the button above). The same fight from several members becomes one pull below.</p>
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
      <td>{when(p.endMs)}<small>{hpText(p.hpLeft) || (p.killed ? "killed" : "not killed")}</small></td><td class="n">{clock(p.battleTimeMs)}</td>
      <td>{p.chars.join(", ") || "Unknown"}</td><td class="n">{p.rows.length}</td></tr>
    {#if open === p.id}<tr class="skills"><td colspan="4"><table class="sheet">
      <thead><tr><th>Player</th><th class="n">DPS</th><th class="n">Damage</th><th class="n">Share</th><th class="n" title="How much of the fight the player spent hitting the boss (a gap of more than 2 s between hits is time not hitting)">Active</th><th class="n">Deaths</th></tr></thead>
      <tbody>{#each p.rows as { key, row: r, own } (key)}
        <tr class="prow" tabindex="0" class:you={own} style:--cls={classColor(r.job) || null} aria-expanded={who === key}
          onclick={() => { who = who === key ? "" : key; }} onkeydown={(e) => { if (e.key === "Enter") who = who === key ? "" : key; }}>
          <td>{#if classIcon(r.job)}<img class="cls-icon" src={classIcon(r.job)} alt={r.job} title={r.job} width="22" height="23">{/if}<span class="name">{displayName(r)}</span>
            <small>{[r.job, own ? "own record" : "as a member saw them"].filter(Boolean).join(" · ")}</small></td>
          <td class="n">{short(r.dps)}/s</td><td class="n">{short(r.damage)}</td><td class="n">{r.share.toFixed(1)}%</td><td class="n">{activeText(r, p.battleTimeMs)}</td><td class="n">{r.deaths ?? "—"}</td></tr>
        {#if who === key}<tr class="skills"><td colspan="6"><PlayerDetail row={r} ms={p.battleTimeMs}
          noSkills="Skills only from a player's own record: they did not share this fight." /></td></tr>{/if}
      {/each}</tbody></table></td></tr>{/if}
  {/each}</tbody></table></div>
  <p class="hint">Fights of the same boss that members recorded at the same time are one pull. Each player's numbers come from their own record when they shared it.
    Click a player for hits, crits, healing, deaths (and when) and damage taken.</p></section>{/if}
