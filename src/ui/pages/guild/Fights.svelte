<script lang="ts">
  // Boss fights the members shared: per boss, each member's best DPS and fastest kill; two runs side by side.
  import { untrack } from "svelte";
  import { bossFights, fightBosses } from "../../../app/guild.ts";
  import { yourDps, type FightRecord } from "../../../domain/fights.ts";
  import { memberBests } from "../../../domain/guild.ts";
  import { clock, short } from "../../../domain/meter.ts";
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
