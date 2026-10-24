<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";
  import { clock, displayName, hpLeft, short, STATUS_TEXT, TARGET_MODES, viewRows, VIEWS, type MeterUpdate, classColor, skillIconUrl } from "../../domain/meter.ts";
  import { meterOverlay, meterPartyOnly, meterPause, meterReconnect, meterReset, meterTargetMode, meterView, meterWatch, onMeter } from "../../infra/meter.ts";
  import { isDesktop } from "../../infra/system.ts";
  import { act } from "../actions.ts";
  import { classIcon } from "../classes.ts";
  import { showStatus } from "../overlays.ts";
  import { ui } from "../state.svelte.ts";

  let u = $state<MeterUpdate | undefined>();
  const open = new SvelteSet<number>(); // players whose skill breakdown is shown
  $effect(() => onMeter((x) => { u = x; })); // the first visit starts the capture
  // Per-skill details only for the rows that are open; none once the page is left.
  $effect(() => { meterWatch([...open]).catch(() => {}); return () => { meterWatch([]).catch(() => {}); }; });

  const f = $derived(u?.fight);
  const left = $derived(f?.target ? hpLeft(f.target) : undefined);
  const idle = $derived(ui.data.settings.dpsIdleSeconds);
  const idleText = $derived(idle ? `${idle} s without activity` : "never (Settings)");
  const view = $derived(u?.view ?? "damage");
  const rows = $derived(f ? viewRows(f, view) : []);
  const unnamed = $derived(rows.some(({ row: r }) => !r.name && !r.isYou));
  // Column labels per view: per second, total, and what the breakdown lists.
  const COLS = { damage: ["DPS", "Damage"], healing: ["HPS", "Healing"], taken: ["Taken/s", "Taken"] } as const;

  async function run(what: () => Promise<unknown>) {
    try { await what(); } catch (e) { showStatus("DPS meter: " + e, true); }
  }
  const toggle = (id: number) => (open.has(id) ? open.delete(id) : open.add(id));
  // Packets lost in the last minute (the parser fell behind): the numbers miss some hits.
  const lostLog: [number, number][] = [];
  let lostRecently = $state(0);
  $effect(() => {
    const n = ui.meter?.lostPackets ?? 0, now = ui.now;
    lostLog.push([now, n]);
    while (lostLog.length && now - lostLog[0][0] > 60_000) lostLog.shift();
    lostRecently = n - (lostLog[0]?.[1] ?? n);
  });
</script>

<p class="hint dps-note">Reads a copy of the game's network traffic through Npcap. Never touches the game's memory or files.
  Third-party tools may be against the game's terms of service: use at your own risk.
  {#if idle}The fight resets after {idle} s without damage, healing or damage taken (Settings).{/if}</p>

{#if !u || !f}<section><p class="hint">Starting the meter…</p></section>{:else}
  <div class="dps-status {u.status}"><span class="dot"></span><b>{STATUS_TEXT[u.status]}</b><span>{u.message}</span>
    {#if u.pingMs != null}<span class="ping num">{u.pingMs} ms</span>{/if}</div>
  {#if lostRecently}<p class="hint warn-line">The meter fell behind the game's traffic and lost {lostRecently.toLocaleString("en-US")} packets in the
    last minute: the numbers above miss some hits. It happens in very crowded fights (sieges).</p>{/if}

  {#if u.status === "no-capture"}<section><h2>Npcap is needed</h2><p>Install <a href="https://npcap.com/#download" target="_blank" rel="noopener">Npcap</a> (free),
      tick <b>“Install Npcap in WinPcap API-compatible Mode”</b>, then restart the companion. If you ticked “Restrict Npcap driver's access
      to Administrators only”, the companion must run as administrator.</p></section>
  {:else if u.status === "searching"}<p class="hint">Still searching after a fight? Hit Reconnect, or start the companion before the game.</p>{/if}

  <!-- What the game has told the companion besides the fight: shows which of these never arrived. -->
  {@const maps = new Set(u.bosses.map((b) => b.mapId))}
  <p class="hint">Game data: playing <b>{u.profile?.name ?? "not said yet"}</b>{#if u.profile?.level} (lv {u.profile.level}){/if}
    · Odyle {u.odyle ? `${u.odyle.basic}/${u.odyle.charged} (${u.odyle.owner ?? "owner not said yet"})` : "not sent yet"}
    · boss maps read: {maps.size} ({u.bosses.length} bosses: {u.bosses.filter((b) => b.up).length} up, {u.bosses.filter((b) => !b.up && b.timeMs > Date.now()).length} respawning, {u.bosses.filter((b) => !b.timeMs).length} no time)
    · saved boss timers: {ui.data.bosses.length}</p>

  <div class="toolbar dps-tools">
    <label>Target <select aria-label="Target mode" value={f.targetMode} onchange={(e) => run(() => meterTargetMode(e.currentTarget.value))}>
      {#each TARGET_MODES as [id, label]}<option value={id}>{label}</option>{/each}</select></label>
    <div class="seg" role="group" aria-label="Who to show">
      <button class:on={!u.partyOnly} aria-pressed={!u.partyOnly} onclick={() => run(() => meterPartyOnly(false))}>Everyone on target</button>
      <button class:on={u.partyOnly} aria-pressed={u.partyOnly} onclick={() => run(() => meterPartyOnly(true))}>My party</button>
    </div>
    <div class="seg" role="group" aria-label="Show">
      {#each VIEWS as [id, label]}<button class:on={view === id} aria-pressed={view === id} onclick={() => run(() => meterView(id))}>{label}</button>{/each}
    </div>
    <button aria-pressed={u.paused} onclick={() => run(() => meterPause(!u!.paused))}>{u.paused ? "Resume" : "Pause"}</button>
    <button onclick={() => run(async () => { await meterReset(); open.clear(); })}>Reset</button>
    <button class="ghost" onclick={() => run(async () => { await meterReconnect(); showStatus("Looking for the game connection again…"); })}>Reconnect</button>
    <button class:primary={ui.overlay} disabled={!isDesktop()} title={isDesktop() ? "Shows during fights, hides after " + idleText : "Desktop app only"}
      onclick={() => run(async () => { const on = !ui.overlay; await act(() => { ui.data.settings.dpsOverlay = on; }); await meterOverlay(on); })}>{ui.overlay ? "Overlay on" : "Overlay"}</button>
  </div>

  {#if f.target}{@const t = f.target}<section class="dps-target">
    <div class="tname"><b>{t.name || "Unknown target"}</b>{#if t.isBoss}<span class="pill">Boss</span>{/if}<span class="num time">{clock(f.battleTimeMs)}</span></div>
    {#if left != null}<div class="bar hp"><i style:--p={String(left)}></i></div><small class="num">{Math.round(left * 100)}% of {short(t.maxHp)} HP</small>{/if}
  </section>{/if}

  {#if rows.length}<section class="dps-table"><div class="scroll"><table class="sheet">
      <thead><tr><th class="n">#</th><th>Player</th><th class="n">{COLS[view][0]}</th><th class="n">{COLS[view][1]}</th>
        <th class="n">{view === "taken" ? "Hits" : "Share"}</th></tr></thead>
      <tbody>{#each rows as { row: r, value, perSec, share }, i (r.id)}
        <tr class="prow" class:you={r.isYou} class:heal={view === "healing"} class:taken={view === "taken"} style:--p={String(Math.min(1, share / 100))}
          style:--cls={classColor(r.job) || null}
          aria-expanded={view !== "taken" && open.has(r.id)} onclick={() => view !== "taken" && toggle(r.id)}>
          <td class="n rank">{i + 1}</td>
          <td>{#if classIcon(r.job)}<img class="cls-icon" src={classIcon(r.job)} alt={r.job} title={r.job} width="22" height="23">{:else}<span class="cls-icon none" aria-hidden="true"></span>{/if}<span class="name" class:dim-name={!r.name}>{displayName(r)}</span>{#if r.job || (r.inParty && !r.isYou)}<small>{[r.job, r.inParty && !r.isYou && !u.partyOnly ? "party" : ""].filter(Boolean).join(" · ")}</small>{/if}{#if r.combatPower} <small class="dim">CP {short(r.combatPower)}</small>{/if}</td>
          <td class="n">{short(perSec)}/s</td><td class="n">{short(value)}</td>
          <td class="n">{view === "taken" ? r.hitsTaken : share.toFixed(1) + "%"}</td></tr>
        {#if view !== "taken" && open.has(r.id)}{@const list = view === "healing" ? r.healSkills : r.skills}<tr class="skills"><td colspan="5"><table class="sheet">
          <thead><tr><th>Skill</th><th class="n">{view === "healing" ? "Healing" : "Damage"}</th><th class="n">Share</th><th class="n">{view === "healing" ? "Ticks" : "Hits"}</th><th class="n">Crit</th></tr></thead>
          <tbody>{#each list as s}<tr><td class="skill-name">{#if s.icon}<img class="skill-icon" src={skillIconUrl(s.icon)} alt="" loading="lazy" width="20" height="20"
                onerror={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = "hidden")}>{:else}<span class="skill-icon none" aria-hidden="true"></span>{/if}{s.name}{#if s.dot}<span class="dim">{view === "healing" ? "HoT" : "DoT"}</span>{/if}</td><td class="n">{short(s.damage)}</td>
              <td class="n">{(s.share * 100).toFixed(1)}%</td><td class="n">{s.hits}</td><td class="n">{s.dot || view === "healing" ? "–" : Math.round(s.critRate * 100) + "%"}</td></tr>
            {:else}<tr><td colspan="5" class="dim">No skill data yet.</td></tr>{/each}</tbody></table></td></tr>{/if}
      {/each}</tbody></table></div><p class="hint">{view === "taken" ? "Damage taken from the fight's monsters." : "Click a player for the skill breakdown."}{#if unnamed}&nbsp;Players shown as #number: the game sends
        names on loading screens (teleport, zone change, dungeon), so start the companion before you enter.{/if}</p></section>
  {:else}<section class="empty-fight"><p class="hint">{view === "healing" ? "No healing yet." : view === "taken" ? "No damage taken yet." : u.partyOnly ? "No damage from your party yet." : "No fight yet. Hit something."}</p></section>{/if}
{/if}
