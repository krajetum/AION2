<script lang="ts">
  // Settings > Diagnostics: the packet recorder, to find new records in the game's traffic (hidden cubes, the market)
  // (src-tauri/meter/src/recorder.rs). The player picks what to keep, records, sets marks in game moments, and sends
  // the file for analysis.
  import type { GameRecipes } from "../../domain/crafting.ts";
  import { clock, fileSize, type RecorderStatus } from "../../domain/meter.ts";
  import { isDesktop } from "../../infra/system.ts";
  import { crashLog, recorderMark, recorderStart, recorderStatus, recorderStop, type RecordKinds } from "../../infra/meter.ts";
  import { ui } from "../state.svelte.ts";

  const MARKS = ["Cube sound starts", "Cube opened", "Cube gone (someone took it)", "Cube sound stops"];
  let st = $state<RecorderStatus | null>(null);
  let error = $state("");
  // What goes in the file: everything of the game connection (as before), only what holds a known item, the game's other connections.
  let kinds = $state<RecordKinds>({ combat: true, items: false, other: false });
  const KINDS: [keyof RecordKinds, string, string][] = [
    ["combat", "Game connection", "every frame: combat, movement, chat (large)"],
    ["items", "Known items", "only what holds an item code, with its name: the market (small)"],
    ["other", "Other game connections", "the game's other connections, 64 KB each, and whether they are encrypted"],
  ];

  /** Item code → name: the game's recipes, your Crafting items and the currencies. */
  async function itemNames(): Promise<Record<number, string>> {
    const g = (await import("../../assets/recipes.json")).default as unknown as GameRecipes;
    const names: Record<number, string> = { 930100031: "Kina", 930100001: "Bound Kina", 930100003: "Abyss Points", 930100017: "Nightmare Coins", 930100011: "Shugo Coins" };
    for (const [code, name] of Object.entries(g.items)) names[+code] = name;
    for (const it of Object.values(ui.data.crafting.items)) if (it.code) names[it.code] = it.name;
    return names;
  }

  $effect(() => {
    recorderStatus().then((s) => { st = s; });
    const t = setInterval(() => { if (st?.recording) recorderStatus().then((s) => { st = s; }); }, 1000);
    return () => clearInterval(t);
  });

  let crash = $state<{ path: string | null; text: string } | null>(null);
  $effect(() => { crashLog().then((c) => { crash = c; }).catch(() => {}); });

  async function start() {
    error = "";
    try { st = await recorderStart(kinds, kinds.items ? await itemNames() : {}); } catch (e) { error = String(e); }
  }
</script>

<section><h2>Diagnostics</h2>
  {#each KINDS as [k, label, what] (k)}<label class="setting switch"><span>{label} <small class="dim">{what}</small></span>
    <input type="checkbox" bind:checked={kinds[k]} disabled={st?.recording}></label>{/each}
  <div class="btns">
    {#if st?.recording}<button onclick={async () => { st = await recorderStop(); }}>Stop recording</button>
    {:else}<button disabled={!isDesktop() || !(kinds.combat || kinds.items || kinds.other)} onclick={start}>Record game packets</button>{/if}
  </div>
  {#if st?.recording}<div class="btns">{#each MARKS as m}<button onclick={async () => { st = await recorderMark(m); }}>Mark: {m}</button>{/each}</div>{/if}
  {#if st?.path}<p class="hint">
    {st.recording ? "Recording" : "Recorded"} {clock(st.ms)} · {st.frames.toLocaleString("en-US")} frames · {fileSize(st.bytes)} · {st.marks} marks{#if st.connections} · {st.connections} other connections{/if}{#if st.ended} · stopped: {st.ended}{/if}<br>
    <code>{st.path}</code></p>{/if}
  {#if error}<p class="hint error">{error}</p>{/if}
  <p class="hint">Finds new things in the game's traffic (a hidden cube near, a market search). Pick what to keep, start
    recording, do the thing in game and press a mark at each moment (or note the time), then stop and send the file.
    With the game connection it holds everything the game sends you (names and chat included); it stays on your PC.
    Only the game's own connections are read, never other programs'. Stops by itself after 15 minutes or 200 MB.{#if !isDesktop()}{" "}<b>Desktop app only.</b>{/if}</p>
  <div class="setting"><span>Crash log</span><span class="ctl">{crash?.text ? "Has entries" : isDesktop() ? "No crash recorded" : "Desktop app only"}</span></div>
  {#if crash?.path}<p class="hint">If the app closes by itself, send this file: <code>{crash.path}</code>. A freeze ("not responding")
    is not written here: Windows' Event Viewer has it (Windows Logs → Application).</p>{/if}
  {#if crash?.text}<details class="crash"><summary>Last entries</summary><pre>{crash.text}</pre></details>{/if}
</section>
