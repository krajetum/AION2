<script lang="ts">
  // Guild page: create or join with a code, the next field bosses on the guild's server, the members' gear,
  // their shared boss fights, and the officer panel (Discord alerts, invite code, members).
  import { adminGuild, bossFights, cancelCallup, createCallup, createGuild, fightBosses, joinGuild, leaveGuild, setOfficerKey, setShare } from "../../app/guild.ts";
  import { bossesByMap, bossLabel, bossState } from "../../domain/bosses.ts";
  import { yourDps, type FightRecord } from "../../domain/fights.ts";
  import { leadText, meCard, memberBests, ONLINE_MS, rosterRows, type GuildMe, type Ping } from "../../domain/guild.ts";
  import { classColor, clock, short } from "../../domain/meter.ts";
  import { REGIONS, regionOf, serverName, serversIn } from "../../domain/servers.ts";
  import { formatCountdown } from "../../domain/time.ts";
  import { untrack } from "svelte";
  import { officialProfile } from "../../infra/armory.ts";
  import { CrowdError } from "../../infra/crowd.ts";
  import { isDesktop } from "../../infra/system.ts";
  import { save, refreshGuild } from "../actions.ts";
  import { classIcon } from "../classes.ts";
  import { hm, num } from "../format.ts";
  import { showStatus } from "../overlays.ts";
  import SkillCompare from "../parts/SkillCompare.svelte";
  import { ui } from "../state.svelte.ts";

  const g = $derived(ui.data.guild);
  const view = $derived(ui.guild && ui.guild.id === g?.id ? ui.guild : null);
  const profile = $derived(ui.meter?.profile && !ui.meter.demo ? ui.meter.profile : null);

  let busy = $state(false), error = $state("");
  const say = (e: unknown) => e instanceof CrowdError
    ? e.status === 404 ? "No guild has that code." : e.status === 429 ? "Too many changes this hour: try again later."
      : e.status === 403 ? `Refused: ${e.reason || "not allowed"}.` : e.status === 400 ? "The server refused that (check what you typed)." : e.message
    : e instanceof Error ? e.message : String(e);
  async function run(work: () => Promise<unknown>, done?: string) {
    busy = true; error = "";
    try { await work(); await save(); if (done) showStatus(done); }
    catch (e) { error = say(e); }
    busy = false;
  }

  // ---- No guild yet: create or join ----
  let guildName = $state(""), code = $state(""), charName = $state("");
  let region = $state(regionOf(ui.data.serverId ?? 0) || "eu");
  let serverId = $state(ui.data.serverId ?? 0);
  const servers = $derived(serversIn(region));
  $effect(() => { if (!servers.some((s) => s.id === serverId)) serverId = servers[0]?.id ?? 0; });
  /** Your card: the character the meter sees, else the name typed in (no gear numbers then). */
  const me = $derived<GuildMe | null>(profile ? meCard(profile) : charName.trim() ? { name: charName.trim(), className: "", itemLevel: null, combatPower: null } : null);
  const create = () => run(() => createGuild(ui.data, guildName.trim(), profile?.serverId ?? serverId, me!).then(() => refreshGuild(false)), "Guild created");
  const join = () => run(() => joinGuild(ui.data, code, me!).then(() => refreshGuild(false)), "Joined the guild");

  // ---- In a guild ----
  // untrack: refreshGuild reads the meter, which updates 5 times a second.
  const guildId = $derived(g?.id);
  $effect(() => { if (guildId) untrack(() => void refreshGuild(false)); });
  const sameServer = $derived(!!g && ui.data.serverId === g.serverId);
  const nextBosses = $derived(sameServer ? bossesByMap(ui.data.bosses, ui.now).flatMap((m) => m.bosses)
    .filter((b) => bossState(b, ui.now) === "due").sort((a, b) => a.timeMs - b.timeMs).slice(0, 8) : []);

  // Gear: what members shared, else their official profile (desktop app only: the site sends no CORS headers).
  let official = $state<Record<string, { itemLevel: number | null; combatPower: number | null } | null>>({});
  $effect(() => {
    const v = view;
    if (!v || !isDesktop()) return;
    untrack(() => {
      for (const m of v.members) {
        if (m.itemLevel !== null || m.name in official) continue;
        official[m.name] = null;
        officialProfile(m.name, v.serverId).then((p) => { if (p) official[m.name] = { itemLevel: p.itemLevel, combatPower: p.combatPower }; }).catch(() => {});
      }
    });
  });
  const roster = $derived(view ? rosterRows(view.members, official) : []);
  const openPlayer = (name: string) => { ui.lookup = { name, serverId: g!.serverId }; ui.tab = "players"; history.replaceState(null, "", "#players"); };
  const share = (k: "gear" | "fights", on: boolean) => run(() => setShare(ui.data, { ...g!.share, [k]: on }).then(() => refreshGuild(false)));
  const leave = () => { if (confirm(`Leave ${g!.name}? Your card and shared fights are deleted from the guild.`)) run(async () => { await leaveGuild(ui.data); ui.guild = null; }, "Left the guild"); };

  // Fights the members shared, per boss.
  let bosses = $state<{ boss: string; n: number }[]>([]), boss = $state(""), fights = $state<FightRecord[]>([]), picked = $state<string[]>([]);
  $effect(() => { if (guildId && view) untrack(() => fightBosses(ui.data).then((b) => { bosses = b; if (!boss && b[0]) boss = b[0].boss; }).catch(() => {})); });
  $effect(() => {
    const b = boss;
    if (guildId && b) untrack(() => { picked = []; bossFights(ui.data, b).then((f) => { fights = f; }).catch((e) => { error = say(e); }); });
  });
  const bests = $derived(memberBests(fights));
  const pair = $derived(picked.map((id) => fights.find((f) => f.id === id)).filter((f): f is FightRecord => !!f));
  const pick = (id: string) => { picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(-2); };

  // ---- Call-ups ----
  const when = (t: number) => new Date(t).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const localInput = (t: number) => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16); };
  const minWhen = localInput(Date.now());
  let cuWhen = $state(""), cuMessage = $state(""), cuPing = $state<Ping>("none"), cuLeads = $state<number[]>([1440, 60]);
  let leadAmount = $state(2), leadUnit = $state<"minutes" | "hours" | "days">("days");
  function addLead() {
    const min = Math.round(leadAmount * (leadUnit === "days" ? 1440 : leadUnit === "hours" ? 60 : 1));
    if (!(min >= 0 && min <= 14 * 1440) || cuLeads.includes(min)) return;
    cuLeads = [...cuLeads, min].sort((a, b) => b - a);
  }
  const addCallup = () => run(async () => {
    const atMs = new Date(cuWhen).getTime();
    if (!(atMs > Date.now())) throw new Error("Pick a time in the future.");
    await createCallup(ui.data, { atMs, message: cuMessage.trim(), ping: cuPing, leads: cuLeads });
    cuWhen = ""; cuMessage = ""; cuPing = "none";
    await refreshGuild(false);
  }, "Call-up planned");

  // ---- Officer ----
  let webhook = $state(""), keyInput = $state("");
  const admin = (a: Parameters<typeof adminGuild>[1], done: string) =>
    run(async () => { const r = await adminGuild(ui.data, a); await refreshGuild(false); if (a.test && !r.tested) throw new Error("Discord refused the test post: check the webhook URL"); }, done);
  const saveHook = () => admin({ webhook: webhook.trim() || null, test: !!webhook.trim() }, webhook.trim() ? "Webhook saved, test posted" : "Webhook removed").then(() => { webhook = ""; });
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => showStatus("Copied"), () => showStatus("Copy failed"));
  const pretty = (c: string) => c.replace(/(.{4})(?=.)/g, "$1-");
  const online = (t: number) => ui.now - t < ONLINE_MS;
  const ago = (t: number) => { const m = Math.max(0, Math.round((ui.now - t) / 60_000)); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };
</script>

{#if !g}
  <p class="hint intro">A guild shares field-boss alerts (in your Discord channel), the members' gear and the boss fights they choose to share.
    One member creates it and gets an invite code for the others, plus an officer key for the settings. No account needed.</p>
  {#if profile}<p class="hint">You'll appear as <b>{profile.name}</b> ({serverName(profile.serverId) || `server ${profile.serverId}`}), as the meter sees you.</p>
  {:else}<label class="toolbar start">Your character <input bind:value={charName} placeholder="Character name" autocomplete="off"></label>
    <p class="hint">Or start the game with the companion open: the meter fills in your character, item level and CP.</p>{/if}
  <div class="cards">
    <section class="dps-table"><h2>Join a guild</h2>
      <form class="toolbar start" onsubmit={(e) => { e.preventDefault(); join(); }}>
        <input bind:value={code} placeholder="Invite code (XXXX-XXXX-XXXX-XXXX)" aria-label="Invite code" autocomplete="off" required>
        <button disabled={busy || !me}>Join</button></form></section>
    <section class="dps-table"><h2>Create a guild</h2>
      <form class="toolbar start" onsubmit={(e) => { e.preventDefault(); create(); }}>
        <input bind:value={guildName} placeholder="Guild or static name" aria-label="Guild name" maxlength="32" autocomplete="off" required>
        {#if !profile}<select bind:value={region} aria-label="Region">{#each Object.values(REGIONS) as r}<option value={r}>{r.toUpperCase()}</option>{/each}</select>
          <select bind:value={serverId} aria-label="Server">{#each servers as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select>{/if}
        <button disabled={busy || !me}>Create</button></form></section>
  </div>
  {#if error}<p class="hint">{error}</p>{/if}
{:else}
  <div class="toolbar start">
    <h2 class="guild-name">{g.name} <span class="count">{serverName(g.serverId) || `server ${g.serverId}`} · {view?.members.length ?? "…"} members</span></h2>
    {#if g.memberCode}<button class="ghost" title="Invite code: give it to new members" onclick={() => copy(pretty(g.memberCode!))}>Copy invite code</button>{/if}
    <button class="ghost" disabled={busy} onclick={leave}>Leave</button>
  </div>
  {#if error}<p class="hint">{error}</p>{/if}
  {#if !view}<p class="hint">Reading the guild…</p>{/if}

  <section class="dps-table"><h2>Next field bosses</h2>
    {#if !sameServer}<p class="hint">Timers come from the boss maps players on {serverName(g.serverId) || "the guild's server"} share. Play a character there with the companion open to see them.</p>
    {:else if !nextBosses.length}<p class="hint">No respawn time known. Anyone with the companion open can refresh them by opening the world map in game.</p>
    {:else}<div class="scroll"><table class="sheet"><thead><tr><th>Boss</th><th class="n">Respawns</th></tr></thead>
      <tbody>{#each nextBosses as b (`${b.mapId}:${b.bossId}`)}<tr><td><span class="name">{bossLabel(b, ui.data.bossNames)}</span></td>
        <td class="n num">{formatCountdown(b.timeMs - ui.now)} · {hm(b.timeMs)}</td></tr>{/each}</tbody></table></div>{/if}
    <p class="hint">{view?.hasWebhook ? `Posted to the guild's Discord ${view.leadMin} min before each respawn.` : "An officer can post these to Discord (Officer, below)."}
      Your own alerts: <a href="#bosses">Field Bosses</a>.</p>
  </section>

  {#if view}<section class="dps-table"><h2>Call-ups <span class="count">{view.callups.length}</span></h2>
    {#each view.callups as c (c.id)}<div class="callup" class:past={c.atMs <= ui.now}>
      <div><b>{when(c.atMs)}</b> <span class="dim">{c.atMs > ui.now ? `in ${formatCountdown(c.atMs - ui.now)}` : "now"}</span>
        {#if c.ping !== "none"}<span class="tag">@{c.ping}</span>{/if}</div>
      <p>{c.message}</p>
      <small class="dim">Reminders: {c.leads.map((l) => leadText(l) + (l ? " before" : "")).join(" · ")}</small>
      {#if g.officerKey}<button class="ghost" disabled={busy} onclick={() => { if (confirm("Cancel this call-up? No more reminders are sent.")) run(() => cancelCallup(ui.data, c.id).then(() => refreshGuild(false)), "Call-up cancelled"); }}>Cancel</button>{/if}
    </div>{:else}<p class="hint">No raid planned.{g.officerKey ? " Plan one below." : " Officers plan them; you get a \"Guild reminder\" here and in Discord."}</p>{/each}

    {#if g.officerKey}<form class="new-callup" onsubmit={(e) => { e.preventDefault(); void addCallup(); }}>
      <h3>New call-up</h3>
      <label>When <input type="datetime-local" bind:value={cuWhen} min={minWhen} required></label>
      <label>Message <textarea bind:value={cuMessage} maxlength="500" rows="3" placeholder="Raid Gartua: meet at the portal, bring potions" required></textarea></label>
      <div class="seg" role="group" aria-label="Ping in Discord">
        {#each [["none", "No ping"], ["here", "@here"], ["everyone", "@everyone"]] as [v, label]}
          <button type="button" class:on={cuPing === v} aria-pressed={cuPing === v} onclick={() => { cuPing = v as Ping; }}>{label}</button>{/each}
      </div>
      <div class="leads">Reminders:
        {#each cuLeads as l, i (l)}<span class="chip">{leadText(l)}{l ? " before" : ""}
          <button type="button" class="ghost" aria-label="Remove reminder {leadText(l)}" onclick={() => { cuLeads = cuLeads.filter((_, k) => k !== i); }}>×</button></span>{/each}
        {#if cuLeads.length < 5}<span class="add">
          <input type="number" min="0" max={leadUnit === "days" ? 14 : leadUnit === "hours" ? 336 : 20160} bind:value={leadAmount} aria-label="Reminder amount">
          <select bind:value={leadUnit} aria-label="Reminder unit"><option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option></select>
          <button type="button" class="ghost" onclick={addLead}>Add reminder</button></span>{/if}
      </div>
      <p class="hint">Members get a "Guild reminder" at each time: in the app, and in Discord {view.hasWebhook ? "(the guild's webhook)" : "once a webhook is set (Officer, below). Until then, only members' apps"}. 0 = at the time.</p>
      <button disabled={busy || !cuLeads.length}>Plan call-up</button>
    </form>{/if}
  </section>

  <section class="dps-table"><h2>Members <span class="count">{view.members.length}</span></h2>
    <div class="toolbar start">
      <label><input type="checkbox" checked={g.share.gear} disabled={busy} onchange={(e) => share("gear", e.currentTarget.checked)}> Share my item level and CP</label>
      <label><input type="checkbox" checked={g.share.fights} disabled={busy} onchange={(e) => share("fights", e.currentTarget.checked)}> Share my boss fights (DPS and skills)</label>
    </div>
    <div class="scroll"><table class="sheet">
      <thead><tr><th>Name</th><th class="n">Item level</th><th class="n">CP</th><th>Seen</th>{#if g.officerKey}<th></th>{/if}</tr></thead>
      <tbody>{#each roster as m (m.name)}<tr style:--cls={classColor(m.className) || null}>
        <td>{#if classIcon(m.className)}<img class="cls-icon" src={classIcon(m.className)} alt={m.className} title={m.className} width="22" height="23">{/if}
          <button class="ghost" title="Profile, gear and best-in-slot check" onclick={() => openPlayer(m.name)}>{m.name}</button>{#if m.className}<small>{m.className}</small>{/if}</td>
        <td class="n">{m.itemLevel == null ? "—" : num(m.itemLevel)}{#if m.official}<small class="dim" title="From the official profile"> official</small>{/if}</td>
        <td class="n">{m.combatPower == null ? "—" : short(m.combatPower)}</td>
        <td>{online(m.seenMs) ? "Online" : ago(m.seenMs)}</td>
        {#if g.officerKey}<td><button class="ghost" disabled={busy} onclick={() => { if (confirm(`Remove ${m.name} from the guild? Rotate the invite code too, or they can join again.`)) admin({ remove: m.name }, `${m.name} removed`); }}>Remove</button></td>{/if}
      </tr>{/each}</tbody></table></div>
    <p class="hint">Click a member for their whole profile and which best-in-slot lines each piece has.{#if !isDesktop()} Official profiles are read in the desktop app only.{/if}</p>
  </section>

  <section class="dps-table"><h2>Shared fights</h2>
    {#if !bosses.length}<p class="hint">No fight shared yet. Members who tick "Share my boss fights" send each boss fight their meter logs.</p>
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
  {/if}

  <section class="dps-table"><h2>Officer</h2>
    {#if g.officerKey}
      <form class="toolbar start" onsubmit={(e) => { e.preventDefault(); saveHook(); }}>
        <input type="url" bind:value={webhook} placeholder={view?.hasWebhook ? "Webhook set: paste a new one to replace it" : "Discord webhook URL"} aria-label="Discord webhook URL" autocomplete="off">
        <button disabled={busy}>{webhook.trim() ? "Save and test" : view?.hasWebhook ? "Remove webhook" : "Save"}</button>
        {#if view?.hasWebhook}<button type="button" class="ghost" disabled={busy} onclick={() => admin({ test: true }, "Test posted")}>Send test</button>{/if}
      </form>
      <label class="toolbar start">Post <select value={view?.leadMin ?? 5} disabled={busy} onchange={(e) => admin({ leadMin: Number(e.currentTarget.value) }, "Lead time saved")}>
        {#each [1, 2, 3, 5, 10, 15] as m}<option value={m}>{m}</option>{/each}</select> minutes before a respawn</label>
      <p class="hint">Discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL. The URL stays on the server: it is never shown again.</p>
      <div class="toolbar start">
        <button class="ghost" onclick={() => copy(pretty(g.officerKey!))}>Copy officer key</button>
        <button class="ghost" disabled={busy} onclick={() => { if (confirm("New invite code? The old one stops working; members already in stay.")) admin({ rotateCode: true }, "New invite code: copy it from the top"); }}>New invite code</button>
      </div>
      <p class="hint">Give the officer key only to other officers: it changes the webhook and removes members.</p>
    {:else}
      <form class="toolbar start" onsubmit={(e) => { e.preventDefault(); void run(async () => setOfficerKey(ui.data, keyInput), "Officer key saved"); keyInput = ""; }}>
        <input bind:value={keyInput} placeholder="Officer key" aria-label="Officer key" autocomplete="off" required><button disabled={busy}>Use</button></form>
      <p class="hint">Officers post boss alerts to Discord and manage members. The key was shown to whoever created the guild.</p>
    {/if}
  </section>
{/if}

<style>
  .cards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .guild-name { margin: 0; }
  .callup { border-top: 1px solid var(--rule); padding: 8px 0; display: grid; gap: 4px; }
  .callup.past { opacity: 0.6; }
  .callup p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .callup button { justify-self: start; }
  .tag { font-size: 12px; padding: 0 6px; border-radius: 8px; background: var(--gold-bg); color: var(--gold-ink); }
  .new-callup { display: grid; gap: 8px; margin-top: 12px; max-width: 560px; }
  .new-callup h3 { margin: 0; }
  .new-callup label { display: grid; gap: 4px; }
  .leads { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .chip { display: inline-flex; align-items: center; gap: 2px; padding: 2px 4px 2px 8px; border-radius: 12px; border: 1px solid var(--border); }
  .add { display: inline-flex; gap: 4px; align-items: center; }
  .add input { width: 64px; }
  input[type="url"], form input:not([type]) { min-width: 0; flex: 1 1 260px; }
</style>
