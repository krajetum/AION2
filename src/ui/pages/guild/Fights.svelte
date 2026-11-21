<script lang="ts">
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { NativeSelect, NativeSelectOption } from "$lib/components/ui/native-select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  // Boss fights the members shared: per boss, each member's best DPS and fastest kill; two runs side by side;
  // the pulls several members recorded, as one fight with everyone's own numbers.
  import { untrack } from "svelte";
  import { bossFights, fightBosses, shareFights } from "../../../app/guild.ts";
  import { yourDps, type FightRecord } from "../../../domain/fights.ts";
  import { groupPulls, isStaticFight, memberBests, STATIC_MIN_MEMBERS, type GuildLink, type GuildView } from "../../../domain/guild.ts";
  import { classColor, clock, displayName, short, skillIconUrl } from "../../../domain/meter.ts";
  import { classIcon } from "../../classes.ts";
  import { hm } from "../../format.ts";
  import { showStatus } from "../../overlays.ts";
  import PlayerStats from "../../parts/PlayerStats.svelte";
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

{#snippet chev(on: boolean)}<ChevronRight class="size-4 text-muted-foreground transition-transform {on ? 'rotate-90' : ''}" />{/snippet}

{#if !g.share.fights}<Panel title="You don't share your boss fights" class="border-gold/30 bg-gold/5">
  <p class="hint mt-0">The others can't see your fights, and your pulls don't merge with theirs. Sharing sends each boss fight your meter logs
    (DPS, skills, deaths; not the second-by-second timeline) when at least {STATIC_MIN_MEMBERS} of the static's members were in it,
    {me ? `starting with those of the past week as ${me}` : "starting with those of the past week"}. Your other fights stay on your PC. You can stop in My settings.</p>
  <Button class="mt-3" size="sm" disabled={gs.busy} onclick={share}>Share my boss fights</Button></Panel>{/if}

<Panel title="Shared fights">
  {#if !bosses.length}<p class="hint mt-0">No static fight shared yet: a boss fight with at least {STATIC_MIN_MEMBERS} of the static's members in it, from a member who shares
    their boss fights (My settings, or the button above). The same fight from several members becomes one pull below.</p>
  {:else}
    <label class="mb-2 flex items-center gap-2 text-sm text-muted-foreground">Boss <NativeSelect size="sm" bind:value={boss}>{#each bosses as b (b.boss)}<NativeSelectOption value={b.boss}>{b.boss} ({b.n})</NativeSelectOption>{/each}</NativeSelect></label>
    <Table.Root>
      <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Member</Table.Head><Table.Head class="text-right">Fights</Table.Head><Table.Head class="text-right">Best DPS</Table.Head><Table.Head class="text-right">Fastest kill</Table.Head></Table.Row></Table.Header>
      <Table.Body>{#each bests as b (b.char)}<Table.Row>
        <Table.Cell class="font-medium">{b.char || "Unknown"}</Table.Cell><Table.Cell class="text-right">{b.fights}</Table.Cell>
        <Table.Cell class="text-right">{#if b.dps}<label class="inline-flex cursor-pointer items-center gap-2"><Checkbox aria-label="Compare" checked={picked.includes(b.dps.id)} onCheckedChange={() => pick(b.dps!.id)} /> {short(yourDps(b.dps))}/s</label>{:else}—{/if}</Table.Cell>
        <Table.Cell class="text-right">{b.fastest ? clock(b.fastest.battleTimeMs) : "—"}</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
    <p class="hint">Tick two best runs to compare their skills.</p>
  {/if}
</Panel>
{#if pair.length === 2}{@const [a, b] = pair}<SkillCompare {a} {b} title="{boss}: {a.char} vs {b.char}" labelA={a.char} labelB={b.char} dpsLabel="DPS"
  onclear={() => { picked = []; }} />{/if}

{#if pulls.length}<Panel title="Pulls" count={pulls.length}><Table.Root>
  <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head class="w-8"></Table.Head><Table.Head>When</Table.Head><Table.Head class="text-right">Time</Table.Head><Table.Head>Recorded by</Table.Head><Table.Head class="text-right">Players</Table.Head></Table.Row></Table.Header>
  <Table.Body>{#each pulls as p (p.id)}
    <Table.Row class="cursor-pointer" tabindex={0} aria-expanded={open === p.id} onclick={() => { open = open === p.id ? "" : p.id; who = ""; }}>
      <Table.Cell>{@render chev(open === p.id)}</Table.Cell>
      <Table.Cell>{when(p.endMs)} {#if p.killed}<Badge variant="secondary" class="ml-1 text-hps">Killed</Badge>{:else}<span class="text-xs text-muted-foreground">not killed</span>{/if}</Table.Cell><Table.Cell class="text-right">{clock(p.battleTimeMs)}</Table.Cell>
      <Table.Cell class="whitespace-normal">{p.chars.join(", ") || "Unknown"}</Table.Cell><Table.Cell class="text-right">{p.rows.length}</Table.Cell></Table.Row>
    {#if open === p.id}<Table.Row class="hover:bg-transparent"><Table.Cell colspan={5} class="bg-muted/40 p-3 whitespace-normal"><Table.Root>
      <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Player</Table.Head><Table.Head class="text-right">DPS</Table.Head><Table.Head class="text-right">Damage</Table.Head><Table.Head class="text-right">Share</Table.Head><Table.Head class="text-right">Deaths</Table.Head></Table.Row></Table.Header>
      <Table.Body>{#each p.rows as { key, row: r, own } (key)}
        <Table.Row class="bar-row cursor-pointer border-0" style="--p: {Math.min(1, r.share / 100)}; {classColor(r.job) ? `--cls: ${classColor(r.job)}` : ''}" tabindex={0} aria-expanded={who === key}
          onclick={() => { who = who === key ? "" : key; }}>
          <Table.Cell><span class="flex items-center gap-2">{#if classIcon(r.job)}<img class="size-5 object-contain" src={classIcon(r.job)} alt={r.job} title={r.job}>{/if}<span class="font-medium {own ? 'text-primary' : ''}">{displayName(r)}</span>
            <span class="text-xs text-muted-foreground">{[r.job, own ? "own record" : "as a member saw them"].filter(Boolean).join(" · ")}</span></span></Table.Cell>
          <Table.Cell class="text-right font-semibold">{short(r.dps)}/s</Table.Cell><Table.Cell class="text-right">{short(r.damage)}</Table.Cell><Table.Cell class="text-right">{r.share.toFixed(1)}%</Table.Cell><Table.Cell class="text-right">{r.deaths ?? "—"}</Table.Cell></Table.Row>
        {#if who === key}<Table.Row class="hover:bg-transparent"><Table.Cell colspan={5} class="p-3 whitespace-normal"><PlayerStats row={r} ms={p.battleTimeMs} />
          {#if r.skills.length}<Table.Root>
            <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Skill</Table.Head><Table.Head class="text-right">Damage</Table.Head><Table.Head class="text-right">Share</Table.Head><Table.Head class="text-right">Hits</Table.Head><Table.Head class="text-right">Used</Table.Head><Table.Head class="text-right">Crit</Table.Head></Table.Row></Table.Header>
            <Table.Body>{#each r.skills as s (s.name)}<Table.Row><Table.Cell><span class="flex items-center gap-2">{#if s.icon}<img class="size-5 rounded" src={skillIconUrl(s.icon)} alt="" loading="lazy">{:else}<span class="size-5 rounded bg-secondary" aria-hidden="true"></span>{/if}{s.name}{#if s.dot}<span class="text-xs text-muted-foreground">DoT</span>{/if}</span></Table.Cell>
              <Table.Cell class="text-right">{short(s.damage)}</Table.Cell><Table.Cell class="text-right">{(s.share * 100).toFixed(1)}%</Table.Cell><Table.Cell class="text-right">{s.hits}</Table.Cell><Table.Cell class="text-right">{s.dot || s.casts == null ? "–" : s.casts}</Table.Cell><Table.Cell class="text-right">{s.dot ? "–" : Math.round(s.critRate * 100) + "%"}</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>
          {:else}<p class="hint">Skills only from a player's own record: they did not share this fight.</p>{/if}</Table.Cell></Table.Row>{/if}
      {/each}</Table.Body></Table.Root></Table.Cell></Table.Row>{/if}
  {/each}</Table.Body></Table.Root>
  <p class="hint">Fights of the same boss that members recorded at the same time are one pull. Each player's numbers come from their own record when they shared it.
    Click a player for hits, crits, healing, deaths (and when) and damage taken.</p></Panel>{/if}
