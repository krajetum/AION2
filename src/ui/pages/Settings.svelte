<script lang="ts">
  import { EVENTS, RESET_CONFIG as C } from "../../config.ts";
  import { addCharacter, deleteCharacter, renameCharacter } from "../../app/characters.ts";
  import { addLead, muteForAnHour, removeLead, setChannelOn, setDpsIdleSeconds, setOverlayOpacity, setLead, setChannelVolume, setVolume, setBirthdayVolume, setWarnHours, toggleChannelMute, unmute } from "../../app/settings.ts";
  import { applyResets } from "../../domain/resets.ts";
  import { nextEvent } from "../../domain/time.ts";
  import { CHANNELS } from "../../domain/alerts.ts";
  import { CADENCES } from "../../domain/types.ts";
  import { playBirthday, playSound, toast } from "../../infra/notifier.ts";
  import { exportJson, importJson } from "../../infra/storage.ts";
  import { clearCubePicture, loadCubePicture, saveCubePicture, type Opener } from "../../infra/map-image.ts";
  import { isDesktop, setAutostart } from "../../infra/system.ts";
  import { cubePopup, eventsOverlay, meterIdle, meterOverlay, overlayStyle, radarOverlay } from "../../infra/meter.ts";
  import { act, commit } from "../actions.ts";
  import { LABEL, pad, WEEKDAYS } from "../format.ts";
  import { ICON } from "../icons.ts";
  import { showStatus } from "../overlays.ts";
  import LeadsRow from "../parts/LeadsRow.svelte";
  import Recorder from "../parts/Recorder.svelte";
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
      showStatus("Import complete.");
    } catch (err) { showStatus("Import failed: " + (err as Error).message, true); }
    input.value = ""; // the old page was re-rendered here, so the same file can be picked again
    act(() => {});
  }
  const CUBE_SIZES: [number, string][] = [[0.8, "Small"], [1, "Medium"], [1.3, "Large"], [1.7, "Extra large"]];
  // The "cube opened" pictures (by you, by another player): kept only on this PC (IndexedDB), shown by the cube popup.
  const OPENERS: [Opener, string][] = [["you", "Picture: opened by you"], ["other", "Picture: opened by others"]];
  let cubePictures = $state<Record<Opener, string>>({ you: "", other: "" });
  const showCubePicture = (who: Opener) => loadCubePicture(who).then((b) => {
    if (cubePictures[who]) URL.revokeObjectURL(cubePictures[who]);
    cubePictures[who] = b ? URL.createObjectURL(b) : "";
  }).catch(() => {});
  $effect(() => { showCubePicture("you"); showCubePicture("other"); });
  async function pickCubePicture(who: Opener, e: Event) {
    const input = e.currentTarget as HTMLInputElement, file = input.files?.[0];
    input.value = "";
    if (file) { await saveCubePicture(who, file); await showCubePicture(who); }
  }
  async function dropCubePicture(who: Opener) { await clearCubePicture(who); await showCubePicture(who); }
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
  <section><h2>DPS meter</h2>
    <label class="setting"><span>Reset after inactivity</span>
      <span class="ctl"><input type="number" inputmode="numeric" min="0" max="3600" value={s.dpsIdleSeconds}
        onchange={(e) => { commit(e, (v) => setDpsIdleSeconds(ui.data, v), () => s.dpsIdleSeconds); meterIdle(s.dpsIdleSeconds); }}> s</span></label>
    {@render toggle("Overlay during fights", s.dpsOverlay, (e) => { s.dpsOverlay = check(e); meterOverlay(s.dpsOverlay, false); }, !isDesktop())}
    <p class="hint">Without damage, healing or damage taken for this long, the meter resets and the overlay hides until the next fight. 0 = never.</p>
  </section>
  <section><h2>Overlays</h2>
    {@render toggle("Event countdown overlay", s.eventsOverlay, (e) => { s.eventsOverlay = check(e); eventsOverlay(s.eventsOverlay); }, !isDesktop())}
    {@render toggle("Hidden cube popup", s.cubePopup, (e) => { s.cubePopup = check(e); cubePopup(s.cubePopup, s.cubePopupSize); }, !isDesktop())}
    <label class="setting"><span>Cube popup size</span><select value={String(s.cubePopupSize)} disabled={!isDesktop() || !s.cubePopup}
      onchange={(e) => act(() => { s.cubePopupSize = +e.currentTarget.value; cubePopup(s.cubePopup, s.cubePopupSize); })}>
      {#each CUBE_SIZES as [k, label]}<option value={String(k)}>{label}</option>{/each}</select></label>
    {@render toggle("Cube radar", s.radar, (e) => { s.radar = check(e); radarOverlay(s.radar); }, !isDesktop())}
    {#if s.radar}<label class="setting"><span>Radar range</span><select value={String(s.radarRange)}
        onchange={(e) => act(() => { s.radarRange = +e.currentTarget.value; })}>
        {#each [50, 100, 200, 400] as m}<option value={String(m)}>{m} m</option>{/each}</select></label>
      {@render toggle("Map under the radar", s.radarMap, (e) => { s.radarMap = check(e); })}
      {@render toggle("Round radar", s.radarRound, (e) => { s.radarRound = check(e); })}{/if}
    {#each OPENERS as [who, label]}<div class="setting"><span>{label}</span><span class="ctl">
      {#if cubePictures[who]}<img class="cube-thumb" src={cubePictures[who]} alt="Chosen: {label}">{/if}
      <label class="btn">{cubePictures[who] ? "Change" : "Choose"} <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onchange={(e) => pickCubePicture(who, e)}></label>
      {#if cubePictures[who]}<button class="ghost" onclick={() => dropCubePicture(who)}>Remove</button>{/if}</span></div>{/each}
    {@render toggle("Hide when the game is not in front", s.overlayFollowGame, (e) => { s.overlayFollowGame = check(e); overlayStyle(s.overlayFollowGame, s.overlayOpacity); }, !isDesktop())}
    <label class="setting"><span>Opacity</span><span class="ctl"><input type="range" min="20" max="100" step="5" value={s.overlayOpacity} aria-label="Overlay opacity"
      onchange={(e) => { commit(e, (v) => setOverlayOpacity(ui.data, v), () => s.overlayOpacity); overlayStyle(s.overlayFollowGame, s.overlayOpacity); }}> {s.overlayOpacity}%</span></label>
    <p class="hint">The cube popup (top centre at first; drag it anywhere) shows while a hidden cube the app knows is in view, with
      its distance and direction, chimes when one appears (sound: Notifications), turns green when you open one (red, with a sad sound, when someone else does) or shows your picture for it instead
      (pictures stay only on this PC).
      It learns cubes as they are opened near you; the first one is built in.
      The cube radar shows the cubes around you, north up, centred on you, while a cube is in view (as the cube popup):
      drag it over the game's minimap, size it by its edges and set the range to match. It cannot turn with the camera, so it matches only a north-up minimap. Overlays remember where you put them.
      The overlays never take the focus from the game. Over the game they need borderless or windowed fullscreen.</p>
  </section>
  <section><h2>Other players</h2>
    {@render toggle("Share boss timers and cube spots", s.crowdShare, (e) => { s.crowdShare = check(e); })}
    <p class="hint">The app shows the field-boss timers other players on your server read, and the hidden cubes three or more
      players saw opened. Sharing sends what your meter sees: server, map and boss ids with their times, and where cubes were
      opened. Never names, yours or anyone's. Turn it off and you still get the others' timers and cubes.</p>
  </section>
  <section><h2>System</h2>
    {@render toggle("Start with Windows", ui.autostart, async (e) => { ui.autostart = await setAutostart(check(e)); }, !isDesktop())}
    <div class="btns"><button onclick={() => exportJson(ui.data)}>Export JSON</button>
      <label class="btn">Import JSON <input type="file" accept=".json,application/json" hidden onchange={importFile}></label></div>
  </section>
  <Recorder />
</div><div>
  <section><h2>Notifications</h2>
    {@render toggle("Sound", s.sound, (e) => { s.sound = check(e); })}
    <label class="setting"><span>Master volume</span><input type="range" min="0" max="100" value={s.volume}
      onchange={(e) => commit(e, (v) => setVolume(ui.data, v), () => s.volume)}></label>
    <div class="setting"><span>Hopex's birthday song</span><span class="ctl"><input type="range" min="5" max="100" value={s.birthdayVolume}
      aria-label="Birthday song volume" onchange={(e) => commit(e, (v) => setBirthdayVolume(ui.data, v), () => s.birthdayVolume)}>
      <button class="ghost" aria-label="Play the birthday song" title="sounds/happy-birthday.mp3" onclick={() => playBirthday(s.birthdayVolume)}>{@html ICON.play}</button></span></div>
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
    <div class="btns"><button onclick={() => act(() => muteForAnHour(ui.data, Date.now()))}>Mute 1 h</button><button class="ghost" onclick={() => act(() => unmute(ui.data))}>Unmute</button><button class="ghost"
      onclick={() => toast(s, "AION 2 Companion", "Notifications are working.")}>Test notification</button></div>
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
