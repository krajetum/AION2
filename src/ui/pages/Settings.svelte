<script lang="ts">
  import { EVENTS, RESET_CONFIG as C } from "../../config.ts";
  import { addCharacter, deleteCharacter, renameCharacter } from "../../app/characters.ts";
  import { addLead, muteForAnHour, removeLead, setChannelOn, setLead, setChannelVolume, setVolume, setWarnHours, toggleChannelMute, unmute } from "../../app/settings.ts";
  import { applyResets } from "../../domain/resets.ts";
  import { nextEvent } from "../../domain/time.ts";
  import { CHANNELS } from "../../domain/alerts.ts";
  import { CADENCES } from "../../domain/types.ts";
  import { playSound, toast } from "../../infra/notifier.ts";
  import { exportJson, importJson } from "../../infra/storage.ts";
  import { isDesktop, setAutostart } from "../../infra/system.ts";
  import { act, commit } from "../actions.ts";
  import { LABEL, pad, WEEKDAYS } from "../format.ts";
  import { ICON } from "../icons.ts";
  import { showStatus } from "../overlays.ts";
  import LeadsRow from "../parts/LeadsRow.svelte";
  import { ui } from "../state.svelte.ts";

  const s = $derived(ui.data.settings);
  let newChar: HTMLInputElement;

  function add() {
    const name = newChar.value.trim();
    if (!name) return;
    addCharacter(ui.data, name);
    newChar.value = "";
    act(() => {});
  }
  function del(id: string) {
    const c = ui.data.characters.find((c) => c.id === id);
    if (!c || ui.data.characters.length < 2 || !confirm(`Delete ${c.name} and all its progress?`)) return;
    deleteCharacter(ui.data, id);
    if (ui.charId === id) ui.charId = ui.data.characters[0].id;
    act(() => {});
  }
  async function importFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement, file = input.files?.[0];
    if (!file) return;
    try {
      const data = await importJson(file);
      applyResets(data, Date.now(), C);
      ui.data = data;
      ui.charId = data.characters[0].id;
      showStatus("Import complete. Stonks.");
    } catch (err) { showStatus("Import failed (skill issue): " + (err as Error).message, true); }
    input.value = ""; // the old page was re-rendered here, so the same file can be picked again
    act(() => {});
  }
  const check = (e: Event) => (e.currentTarget as HTMLInputElement).checked;
</script>

{#snippet toggle(label: string, on: boolean, change: (e: Event) => unknown, disabled = false)}<label class="setting switch"><span>{label}</span><input type="checkbox" checked={on} {disabled}
  onchange={(e) => act(() => change(e))}></label>{/snippet}

<div class="settings"><div>
  <section><h2>Characters</h2>
    {#each ui.data.characters as c (c.id)}<div class="setting"><input value={c.name} aria-label="Character name" autocomplete="off"
      onchange={(e) => commit(e, (v) => renameCharacter(ui.data, c.id, v), () => c.name)}>{#if ui.data.characters.length > 1}<button onclick={() => del(c.id)}>Delete</button>{/if}</div>{/each}
    <div class="setting"><input id="new-char" placeholder="New character name…" aria-label="New character name" autocomplete="off" bind:this={newChar}><button onclick={add}>Add</button></div>
  </section>
  <section><h2>Reset warnings</h2>
    {#each CADENCES as c}<label class="setting"><span>{LABEL[c]} reset</span>
      <span class="ctl"><input type="number" inputmode="numeric" min="0" max="168" value={s.warnHours[c]}
        onchange={(e) => commit(e, (v) => setWarnHours(ui.data, c, v), () => s.warnHours[c])}> h before</span></label>{/each}
  </section>
  <section><h2>System</h2>
    {@render toggle("Start with Windows", ui.autostart, async (e) => { ui.autostart = await setAutostart(check(e)); }, !isDesktop())}
    {@render toggle("Meme mascot", s.memeMascot, (e) => { s.memeMascot = check(e); })}
    <div class="btns"><button onclick={() => exportJson(ui.data)}>Export JSON</button>
      <label class="btn">Import JSON <input type="file" accept=".json,application/json" hidden onchange={importFile}></label></div>
  </section>
</div><div>
  <section><h2>Notifications</h2>
    {@render toggle("Sound", s.sound, (e) => { s.sound = check(e); })}
    <label class="setting"><span>Master volume</span><input type="range" min="0" max="100" value={s.volume}
      onchange={(e) => commit(e, (v) => setVolume(ui.data, v), () => s.volume)}></label>
    {#each CHANNELS as c}{@const ch = s.channels[c.id]}<div class="setting chan">
      {#if c.id === "check"}<span>{c.name}</span>{:else}<label class="switch"><input type="checkbox" checked={ch.on}
        onchange={(e) => act(() => setChannelOn(ui.data, c.id, check(e)))}><span>{c.name}</span></label>{/if}
      <span class="ctl"><input type="range" min="0" max="100" value={ch.volume} aria-label="{c.name} volume" disabled={ch.muted}
        onchange={(e) => commit(e, (v) => setChannelVolume(ui.data, c.id, v), () => ch.volume)}>
        <button class="ghost" aria-pressed={ch.muted} aria-label="Mute {c.name} sound" title="{ch.muted ? 'Unmute' : 'Mute'} sound"
          onclick={() => act(() => toggleChannelMute(ui.data, c.id))}>{@html ch.muted ? ICON.muted : ICON.sound}</button>
        <button class="ghost" aria-label="Play {c.name} sound" title="sounds/{c.sound[0]}.wav"
          onclick={() => playSound(c.sound, s.volume * ch.volume / 100)}>{@html ICON.play}</button></span>
      {#if ch.leads}{@const ev = EVENTS.find((e) => e.id === c.id)}<LeadsRow label={ev?.name ?? c.name} leads={ch.leads}
        next={ch.on && ev ? nextEvent(ev, ui.now, C.timeZone) : undefined}
        onadd={() => addLead(ui.data, c.id)} onremove={(i) => removeLead(ui.data, c.id, i)} onset={(i, v) => setLead(ui.data, c.id, i, v)} />{/if}</div>{/each}
    <div class="setting"><span>Quiet hours</span><span class="ctl">
      <input type="time" value={s.quietStart} aria-label="Quiet hours start" onchange={(e) => commit(e, (v) => { s.quietStart = v; }, () => s.quietStart)}> to
      <input type="time" value={s.quietEnd} aria-label="Quiet hours end" onchange={(e) => commit(e, (v) => { s.quietEnd = v; }, () => s.quietEnd)}></span></div>
    <div class="btns"><button onclick={() => act(() => muteForAnHour(ui.data, Date.now()))}>Shhh (1 h)</button><button class="ghost" onclick={() => act(() => unmute(ui.data))}>Unshhh</button><button class="ghost"
      onclick={() => toast(s, "AION 2 Companion", "If you can read this, it works. Probably.")}>Test notification</button></div>
  </section>
  <section><h2>Reset times <span class="count">TO VERIFY</span></h2>
    <dl>
      <dt>Time zone</dt><dd>{C.timeZone}</dd>
      <dt>Daily</dt><dd>{pad(C.daily.hour)}:{pad(C.daily.minute)}</dd>
      <dt>Weekly</dt><dd>{WEEKDAYS[C.weekly.weekday]} {pad(C.weekly.hour)}:{pad(C.weekly.minute)}</dd>
      <dt>Monthly</dt><dd>Day {C.monthly.day} at {pad(C.monthly.hour)}:{pad(C.monthly.minute)}</dd>
      <dt>Cloud Merchant</dt><dd>Minute {C.cloudMerchantMinute} of every hour</dd>
      {#each EVENTS as ev}<dt>{ev.name}</dt><dd>Every {ev.everyHours} h at :{pad(ev.minute)}{ev.everyHours > 1 ? ` from ${pad(ev.firstHour)}:00` : ""}</dd>{/each}
    </dl>
    <p class="hint">Edit in src/config.ts</p>
  </section>
</div></div>
