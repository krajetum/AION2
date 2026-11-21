<script lang="ts">
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { NativeSelect, NativeSelectOption } from "$lib/components/ui/native-select/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import Panel from "$lib/components/app/Panel.svelte";
  // One setting: its label on the left, the control on the right.
  const ROW = "flex min-h-11 flex-wrap items-center justify-between gap-3 border-b py-1.5 text-sm last:border-0";
  import { EVENTS, RESET_CONFIG as C } from "../../config.ts";
  import { addCharacter, deleteCharacter, renameCharacter } from "../../app/characters.ts";
  import { addLead, muteForAnHour, removeLead, setChannelOn, setDpsIdleSeconds, setOverlayOpacity, setLead, setChannelVolume, setVolume, setBirthdayVolume, setWarnHours, toggleChannelMute, unmute } from "../../app/settings.ts";
  import { applyResets } from "../../domain/resets.ts";
  import { nextEvent } from "../../domain/time.ts";
  import { CHANNELS, SOUND_THEMES } from "../../domain/alerts.ts";
  import { CADENCES } from "../../domain/types.ts";
  import { playBirthday, playSound, toast } from "../../infra/notifier.ts";
  import { exportJson, importJson } from "../../infra/storage.ts";
  import { clearCubePicture, loadCubePicture, saveCubePicture, type Opener } from "../../infra/map-image.ts";
  import { isDesktop, setAutostart } from "../../infra/system.ts";
  import { crashReports } from "../../infra/sentry.ts";
  import { cubePopup, eventsOverlay, meterIdle, meterOverlay, netOverlay, overlayStyle, radarOverlay } from "../../infra/meter.ts";
  import { act, commit } from "../actions.ts";
  import { LABEL, pad, WEEKDAYS } from "../format.ts";
  import { ICON } from "../icons.ts";
  import { showStatus } from "../overlays.ts";
  import LeadsRow from "../parts/LeadsRow.svelte";
  import Recorder from "../parts/Recorder.svelte";
  import { ui } from "../state.svelte.ts";

  const s = $derived(ui.data.settings);
  let newChar = $state<HTMLInputElement | null>(null);

  function add() {
    const name = newChar?.value.trim() ?? "";
    if (!name) return;
    addCharacter(ui.data, name);
    if (newChar) newChar.value = "";
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
</script>

{#snippet toggle(label: string, on: boolean, change: (on: boolean) => unknown, disabled = false)}<label class="{ROW} cursor-pointer"><span>{label}</span>
  <Switch checked={on} {disabled} onCheckedChange={(v) => act(() => change(v))} /></label>{/snippet}
{#snippet range(value: number, label: string, min: number, max: number, change: (e: Event) => void, disabled = false, step = 1)}<input data-slot="range" class="w-32 accent-primary disabled:opacity-35"
  type="range" {min} {max} {step} {value} aria-label={label} {disabled} onchange={change}>{/snippet}

<div class="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-start gap-x-3"><div>
  <Panel title="Characters">
    {#each ui.data.characters as c (c.id)}<div class={ROW}><Input class="flex-1" value={c.name} aria-label="Character name" autocomplete="off"
      onchange={(e) => commit(e, (v) => renameCharacter(ui.data, c.id, v), () => c.name)} />{#if ui.data.characters.length > 1}<Button variant="outline" size="sm" onclick={() => del(c.id)}>Delete</Button>{/if}</div>{/each}
    <div class={ROW}><Input class="flex-1" id="new-char" placeholder="New character name…" aria-label="New character name" autocomplete="off" bind:ref={newChar} /><Button size="sm" onclick={add}>Add</Button></div>
  </Panel>
  <Panel title="Reset warnings">
    {#each CADENCES as c}<label class={ROW}><span>{LABEL[c]} reset</span>
      <span class="flex items-center gap-1.5 text-muted-foreground"><Input class="w-18" type="number" inputmode="numeric" min="0" max="168" value={s.warnHours[c]}
        onchange={(e) => commit(e, (v) => setWarnHours(ui.data, c, v), () => s.warnHours[c])} /> h before</span></label>{/each}
  </Panel>
  <Panel title="DPS meter">
    <label class={ROW}><span>Reset after inactivity</span>
      <span class="flex items-center gap-1.5 text-muted-foreground"><Input class="w-18" type="number" inputmode="numeric" min="0" max="3600" value={s.dpsIdleSeconds}
        onchange={(e) => { commit(e, (v) => setDpsIdleSeconds(ui.data, v), () => s.dpsIdleSeconds); meterIdle(s.dpsIdleSeconds); }} /> s</span></label>
    {@render toggle("Overlay during fights", s.dpsOverlay, (on) => { s.dpsOverlay = on; meterOverlay(s.dpsOverlay, false); }, !isDesktop())}
    <p class="hint">Without damage, healing or damage taken for this long, the meter resets and the overlay hides until the next fight. 0 = never.</p>
  </Panel>
  <Panel title="Mascot">
    {@render toggle("Show the mascot", s.mascot, (on) => { s.mascot = on; })}
    {@render toggle("Confetti and cheers (a list finished, a personal best, a PvP kill)", s.celebrate, (on) => { s.celebrate = on; })}
    <label class={ROW}><span>Gender</span><NativeSelect value={s.mascotGender} disabled={!s.mascot}
      onchange={(e) => act(() => { s.mascotGender = e.currentTarget.value === "f" ? "f" : "m"; })}>
      <NativeSelectOption value="m">Male</NativeSelectOption><NativeSelectOption value="f">Female</NativeSelectOption></NativeSelect></label>
    <p class="hint">The little character of the class you play walks along the bottom of the window once the game says who you are (white wings for Elyos, black for Asmodians). It shouts with the alerts, clings on for 10 minutes after the Spacetime Rift's alert, hops when a hidden cube is in view, cheers when you open it and sulks when someone else does. Drag it, throw it, shake it.</p>
  </Panel>
  <Panel title="Themes">
    {@render toggle("Accent colour of the class you play", s.classAccent, (on) => { s.classAccent = on; })}
    {@render toggle("Halloween theme (25 Oct – 1 Nov)", s.halloween, (on) => { s.halloween = on; })}
    {@render toggle("Winter theme and Advent calendar (1 Dec – 6 Jan)", s.winterTheme, (on) => { s.winterTheme = on; })}
    {@render toggle("Snow and New Year fireworks", s.snow, (on) => { s.snow = on; }, !s.winterTheme)}
    <p class="hint">From 1 December to 6 January the app dresses for winter: a night-blue palette, an aurora on the sidebar, an Advent
      calendar on Home with a Christmas cracker joke behind each door, snow piling up along the bottom of the window and fireworks
      at midnight on New Year's Eve. "Reduce motion" in Windows stops the snow and fireworks. The class accent takes the colour of
      your class's emblem once the game says who you play; Halloween is a week of dusk purple and pumpkin orange.</p>
  </Panel>
  <Panel title="Overlays">
    {@render toggle("Event countdown overlay", s.eventsOverlay, (on) => { s.eventsOverlay = on; eventsOverlay(s.eventsOverlay); }, !isDesktop())}
    {@render toggle("Ping and packet loss overlay", s.netOverlay, (on) => { s.netOverlay = on; netOverlay(s.netOverlay); }, !isDesktop())}
    {@render toggle("Hidden cube popup", s.cubePopup, (on) => { s.cubePopup = on; cubePopup(s.cubePopup, s.cubePopupSize); }, !isDesktop())}
    <label class={ROW}><span>Cube popup size</span><NativeSelect value={String(s.cubePopupSize)} disabled={!isDesktop() || !s.cubePopup}
      onchange={(e) => act(() => { s.cubePopupSize = +e.currentTarget.value; cubePopup(s.cubePopup, s.cubePopupSize); })}>
      {#each CUBE_SIZES as [k, label]}<NativeSelectOption value={String(k)}>{label}</NativeSelectOption>{/each}</NativeSelect></label>
    {@render toggle("Cube radar", s.radar, (on) => { s.radar = on; radarOverlay(s.radar); }, !isDesktop())}
    {#if s.radar}<label class={ROW}><span>Radar range</span><NativeSelect value={String(s.radarRange)}
        onchange={(e) => act(() => { s.radarRange = +e.currentTarget.value; })}>
        {#each [50, 100, 200, 400] as m}<NativeSelectOption value={String(m)}>{m} m</NativeSelectOption>{/each}</NativeSelect></label>
      {@render toggle("Map under the radar", s.radarMap, (on) => { s.radarMap = on; })}
      {@render toggle("Round radar", s.radarRound, (on) => { s.radarRound = on; })}{/if}
    {#each OPENERS as [who, label]}<div class={ROW}><span>{label}</span><span class="flex items-center gap-1.5">
      {#if cubePictures[who]}<img class="size-8 rounded object-cover" src={cubePictures[who]} alt="Chosen: {label}">{/if}
      <label class={buttonVariants({ variant: "outline", size: "sm" })}>{cubePictures[who] ? "Change" : "Choose"} <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onchange={(e) => pickCubePicture(who, e)}></label>
      {#if cubePictures[who]}<Button variant="ghost" size="sm" onclick={() => dropCubePicture(who)}>Remove</Button>{/if}</span></div>{/each}
    {@render toggle("Hide when the game is not in front", s.overlayFollowGame, (on) => { s.overlayFollowGame = on; overlayStyle(s.overlayFollowGame, s.overlayOpacity); }, !isDesktop())}
    <label class={ROW}><span>Opacity</span><span class="flex items-center gap-2 text-muted-foreground tabular-nums">{@render range(s.overlayOpacity, "Overlay opacity", 20, 100,
      (e) => { commit(e, (v) => setOverlayOpacity(ui.data, v), () => s.overlayOpacity); overlayStyle(s.overlayFollowGame, s.overlayOpacity); }, false, 5)} {s.overlayOpacity}%</span></label>
    <p class="hint">The cube popup (top centre at first; drag it anywhere) shows while a hidden cube the app knows is in view, with
      its distance and direction, chimes when one appears (sound: Notifications), turns green when you open one (red, with a sad sound, when someone else does) or shows your picture for it instead
      (pictures stay only on this PC).
      It learns cubes as they are opened near you; the first one is built in.
      The cube radar shows the cubes around you, north up, centred on you, while a cube is in view (as the cube popup):
      drag it over the game's minimap, size it by its edges and set the range to match. It cannot turn with the camera, so it matches only a north-up minimap. Overlays remember where you put them.
      The overlays never take the focus from the game. Over the game they need borderless or windowed fullscreen.</p>
  </Panel>
  <Panel title="Other players">
    {@render toggle("Share boss timers and cube spots", s.crowdShare, (on) => { s.crowdShare = on; })}
    <p class="hint">The app shows the field-boss timers other players on your server read, and the hidden cubes three or more
      players saw opened. Sharing sends what your meter sees: server, map and boss ids with their times, and where cubes were
      opened. Never names, yours or anyone's. Turn it off and you still get the others' timers and cubes.</p>
  </Panel>
  <Panel title="System">
    {@render toggle("Start with Windows", ui.autostart, async (on) => { ui.autostart = await setAutostart(on); }, !isDesktop())}
    {@render toggle("Update by itself when the app opens", s.autoUpdate, (on) => { s.autoUpdate = on; }, !isDesktop())}
    {@render toggle("Get pre-release (beta) versions", s.betaUpdates, (on) => { s.betaUpdates = on; }, !isDesktop())}
    <p class="hint">Beta versions get new features first and may break. Checked when the app opens and every 6 hours.
      Turned off, you stay on your version until the next stable release.</p>
    {@render toggle("Send crash reports", s.crashReports, (on) => { s.crashReports = on; crashReports(s.crashReports); })}
    <p class="hint">Sends the app's errors, crashes, warnings and timings to Sentry so they can be fixed: where in the code, the app version
      and your Windows/WebView version, plus a screen recording of some sessions with every text, input and image hidden.
      No names, servers, positions or save data. For the app's core the switch applies at the next start.</p>
    <div class="flex flex-wrap gap-2 pt-3"><Button variant="outline" size="sm" onclick={() => exportJson(ui.data)}>Export JSON</Button>
      <label class={buttonVariants({ variant: "outline", size: "sm" })}>Import JSON <input type="file" accept=".json,application/json" hidden onchange={importFile}></label></div>
  </Panel>
  <Recorder />
</div><div>
  <Panel title="Notifications">
    {@render toggle("Sound", s.sound, (on) => { s.sound = on; })}
    <label class={ROW}><span>Master volume</span>{@render range(s.volume, "Master volume", 0, 100, (e) => commit(e, (v) => setVolume(ui.data, v), () => s.volume))}</label>
    <label class={ROW}><span>Sound theme</span><NativeSelect value={s.soundTheme}
      onchange={(e) => act(() => { s.soundTheme = SOUND_THEMES.find((t) => t.id === e.currentTarget.value)?.id ?? "default"; })}>
      {#each SOUND_THEMES as t}<NativeSelectOption value={t.id}>{t.name}</NativeSelectOption>{/each}</NativeSelect></label>
    <div class={ROW}><span>Hopex's birthday song</span><span class="flex items-center gap-1">{@render range(s.birthdayVolume, "Birthday song volume", 5, 100,
      (e) => commit(e, (v) => setBirthdayVolume(ui.data, v), () => s.birthdayVolume))}
      <Button variant="ghost" size="icon-sm" aria-label="Play the birthday song" title="sounds/happy-birthday.mp3" onclick={() => playBirthday(s.birthdayVolume)}><ICON.play /></Button></span></div>
    {#each CHANNELS as c}{@const ch = s.channels[c.id]}<div class={ROW}>
      {#if c.id === "check"}<span>{c.name}</span>{:else}<label class="flex flex-[1_1_auto] cursor-pointer items-center gap-2.5"><Switch checked={ch.on}
        onCheckedChange={(on) => act(() => setChannelOn(ui.data, c.id, on))} /><span>{c.name}</span></label>{/if}
      <span class="flex items-center gap-1">{@render range(ch.volume, `${c.name} volume`, 0, 100, (e) => commit(e, (v) => setChannelVolume(ui.data, c.id, v), () => ch.volume), ch.muted)}
        <Button variant="ghost" size="icon-sm" aria-pressed={ch.muted} aria-label="Mute {c.name} sound" title="{ch.muted ? 'Unmute' : 'Mute'} sound"
          onclick={() => act(() => toggleChannelMute(ui.data, c.id))}>{#if ch.muted}<ICON.muted />{:else}<ICON.sound />{/if}</Button>
        <Button variant="ghost" size="icon-sm" aria-label="Play {c.name} sound" title="sounds/{c.sound[0]}.wav"
          onclick={() => playSound(c.sound, s.volume * ch.volume / 100, s.soundTheme)}><ICON.play /></Button></span>
      {#if ch.leads}{@const ev = EVENTS.find((e) => e.id === c.id)}<LeadsRow label={ev?.name ?? c.name} leads={ch.leads}
        next={ch.on && ev ? nextEvent(ev, ui.now, C.timeZone) : undefined}
        onadd={() => addLead(ui.data, c.id)} onremove={(i) => removeLead(ui.data, c.id, i)} onset={(i, v) => setLead(ui.data, c.id, i, v)} />{/if}</div>{/each}
    <div class={ROW}><span>Quiet hours</span><span class="flex items-center gap-1.5 text-muted-foreground">
      <Input class="w-28" type="time" value={s.quietStart} aria-label="Quiet hours start" onchange={(e) => commit(e, (v) => { s.quietStart = v; }, () => s.quietStart)} /> to
      <Input class="w-28" type="time" value={s.quietEnd} aria-label="Quiet hours end" onchange={(e) => commit(e, (v) => { s.quietEnd = v; }, () => s.quietEnd)} /></span></div>
    <div class="flex flex-wrap gap-2 pt-3"><Button variant="outline" size="sm" onclick={() => act(() => muteForAnHour(ui.data, Date.now()))}>Mute 1 h</Button><Button variant="ghost" size="sm" onclick={() => act(() => unmute(ui.data))}>Unmute</Button>
      <Button variant="ghost" size="sm" onclick={() => toast(s, "AION 2 Companion", "Notifications are working.")}>Test notification</Button></div>
  </Panel>
  <Panel title="Reset times" count="TO VERIFY">
    <dl class="text-sm">
      <dt>Time zone</dt><dd>{C.timeZone}</dd>
      <dt>Daily</dt><dd>{pad(C.daily.hour)}:{pad(C.daily.minute)}</dd>
      <dt>Weekly</dt><dd>{WEEKDAYS[C.weekly.weekday]} {pad(C.weekly.hour)}:{pad(C.weekly.minute)}</dd>
      <dt>Monthly</dt><dd>Day {C.monthly.day} at {pad(C.monthly.hour)}:{pad(C.monthly.minute)}</dd>
      <dt>Cloud Merchant</dt><dd>Minute {C.cloudMerchantMinute} of every hour</dd>
      {#each EVENTS as ev}<dt>{ev.name}</dt><dd>Every {ev.everyHours} h at :{pad(ev.minute)}{ev.everyHours > 1 ? ` from ${pad(ev.firstHour)}:00` : ""}{ev.timeZone ? ` (${ev.timeZone})` : ""}</dd>{/each}
    </dl>
    <p class="hint">Edit in src/config.ts</p>
  </Panel>
</div></div>
