<script lang="ts">
  // Settings > Diagnostics: the packet recorder, to find out whether the game's traffic says when a
  // hidden cube is near (src-tauri/meter/src/recorder.rs). The player records, sets marks in game
  // moments, and sends the file for analysis.
  import { clock, fileSize, type RecorderStatus } from "../../domain/meter.ts";
  import { isDesktop } from "../../infra/system.ts";
  import { recorderMark, recorderStart, recorderStatus, recorderStop } from "../../infra/meter.ts";

  const MARKS = ["Cube sound starts", "Cube opened", "Cube gone (someone took it)", "Cube sound stops"];
  let st = $state<RecorderStatus | null>(null);
  let error = $state("");

  $effect(() => {
    recorderStatus().then((s) => { st = s; });
    const t = setInterval(() => { if (st?.recording) recorderStatus().then((s) => { st = s; }); }, 1000);
    return () => clearInterval(t);
  });

  async function start() {
    error = "";
    try { st = await recorderStart(); } catch (e) { error = String(e); }
  }
</script>

<section><h2>Diagnostics</h2>
  <div class="btns">
    {#if st?.recording}<button onclick={async () => { st = await recorderStop(); }}>Stop recording</button>
    {:else}<button disabled={!isDesktop()} onclick={start}>Record game packets</button>{/if}
  </div>
  {#if st?.recording}<div class="btns">{#each MARKS as m}<button onclick={async () => { st = await recorderMark(m); }}>Mark: {m}</button>{/each}</div>{/if}
  {#if st?.path}<p class="hint">
    {st.recording ? "Recording" : "Recorded"} {clock(st.ms)} · {st.frames.toLocaleString("en-US")} frames · {fileSize(st.bytes)} · {st.marks} marks{#if st.ended} · stopped: {st.ended}{/if}<br>
    <code>{st.path}</code></p>{/if}
  {#if error}<p class="hint error">{error}</p>{/if}
  <p class="hint">Finds out whether the game's traffic tells when a hidden cube is near. Start recording, walk to a cube and
    press a mark at each moment (or note the time), then stop and send the file. It holds everything the game sends you
    (names and chat included) and stays on your PC. Stops by itself after 15 minutes or 200 MB.{#if !isDesktop()}{" "}<b>Desktop app only.</b>{/if}</p>
</section>
