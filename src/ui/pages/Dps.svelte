<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";
  import { clock, hpLeft, short, STATUS_TEXT, TARGET_MODES, type MeterUpdate } from "../../domain/meter.ts";
  import { meterOverlay, meterPause, meterReconnect, meterReset, meterTargetMode, onMeter } from "../../infra/meter.ts";
  import { isDesktop } from "../../infra/system.ts";
  import { showStatus } from "../overlays.ts";
  import { ui } from "../state.svelte.ts";

  let u = $state<MeterUpdate | undefined>();
  const open = new SvelteSet<number>(); // players whose skill breakdown is shown
  $effect(() => onMeter((x) => { u = x; })); // the first visit starts the capture

  const f = $derived(u?.fight);
  const left = $derived(f?.target ? hpLeft(f.target) : undefined);

  async function run(what: () => Promise<unknown>) {
    try { await what(); } catch (e) { showStatus("DPS meter: " + e, true); }
  }
  const toggle = (id: number) => (open.has(id) ? open.delete(id) : open.add(id));
</script>

<p class="hint dps-note">Reads a copy of the game's network traffic through Npcap. Never touches the game's memory or files.
  Third-party tools may be against the game's terms of service: use at your own risk.</p>

{#if !u || !f}<section><p class="hint">Starting the meter…</p></section>{:else}
  <div class="dps-status {u.status}"><span class="dot"></span><b>{STATUS_TEXT[u.status]}</b><span>{u.message}</span>
    {#if u.pingMs != null}<span class="ping num">{u.pingMs} ms</span>{/if}</div>

  {#if u.status === "no-capture"}<section><h2>Npcap is needed</h2><p>Install <a href="https://npcap.com/#download" target="_blank" rel="noopener">Npcap</a> (free),
      tick <b>“Install Npcap in WinPcap API-compatible Mode”</b>, then restart the companion. If you ticked “Restrict Npcap driver's access
      to Administrators only”, the companion must run as administrator.</p></section>
  {:else if u.status === "searching"}<p class="hint">Still searching after a fight? Hit Reconnect, or start the companion before the game.</p>{/if}

  <div class="toolbar dps-tools">
    <label>Target <select aria-label="Target mode" value={f.targetMode} onchange={(e) => run(() => meterTargetMode(e.currentTarget.value))}>
      {#each TARGET_MODES as [id, label]}<option value={id}>{label}</option>{/each}</select></label>
    <button aria-pressed={u.paused} onclick={() => run(() => meterPause(!u!.paused))}>{u.paused ? "Resume" : "Pause"}</button>
    <button onclick={() => run(async () => { await meterReset(); open.clear(); })}>Reset</button>
    <button class="ghost" onclick={() => run(async () => { await meterReconnect(); showStatus("Looking for the game connection again…"); })}>Reconnect</button>
    <button class:primary={ui.overlay} disabled={!isDesktop()} title={isDesktop() ? undefined : "Desktop app only"}
      onclick={() => run(() => meterOverlay(!ui.overlay))}>{ui.overlay ? "Hide overlay" : "Overlay"}</button>
  </div>

  {#if f.target}{@const t = f.target}<section class="dps-target">
    <div class="tname"><b>{t.name || "Unknown target"}</b>{#if t.isBoss}<span class="pill">Boss</span>{/if}<span class="num time">{clock(f.battleTimeMs)}</span></div>
    {#if left != null}<div class="bar hp"><i style:--p={String(left)}></i></div><small class="num">{Math.round(left * 100)}% of {short(t.maxHp)} HP</small>{/if}
  </section>{/if}

  {#if f.rows.length}<section class="dps-table"><div class="scroll"><table class="sheet">
      <thead><tr><th class="n">#</th><th>Player</th><th class="n">DPS</th><th class="n">Damage</th><th class="n">Share</th></tr></thead>
      <tbody>{#each f.rows as r, i (r.id)}
        <tr class="prow" class:you={r.isYou} style:--p={String(Math.min(1, r.share / 100))} aria-expanded={open.has(r.id)} onclick={() => toggle(r.id)}>
          <td class="n rank">{i + 1}</td>
          <td><span class="name">{r.name || "#" + r.id}</span>{#if r.job} <small>{r.job}</small>{/if}{#if r.combatPower} <small class="dim">CP {short(r.combatPower)}</small>{/if}</td>
          <td class="n">{short(r.dps)}/s</td><td class="n">{short(r.damage)}</td><td class="n">{r.share.toFixed(1)}%</td></tr>
        {#if open.has(r.id)}<tr class="skills"><td colspan="5"><table class="sheet">
          <thead><tr><th>Skill</th><th class="n">Damage</th><th class="n">Share</th><th class="n">Hits</th><th class="n">Crit</th></tr></thead>
          <tbody>{#each r.skills as s}<tr><td>{s.name}{#if s.dot} <span class="dim">DoT</span>{/if}</td><td class="n">{short(s.damage)}</td>
              <td class="n">{(s.share * 100).toFixed(1)}%</td><td class="n">{s.hits}</td><td class="n">{s.dot ? "–" : Math.round(s.critRate * 100) + "%"}</td></tr>
            {:else}<tr><td colspan="5" class="dim">No skill data yet.</td></tr>{/each}</tbody></table></td></tr>{/if}
      {/each}</tbody></table></div><p class="hint">Click a player for the skill breakdown.</p></section>
  {:else}<section class="empty-fight"><p class="hint">No fight yet. Hit something.</p></section>{/if}
{/if}
