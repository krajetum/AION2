<script lang="ts">
  // The mascot (domain/mascot.ts): your class's little character, walking along the bottom of the window once the game
  // says who you play. It shouts with the alerts, clings on through the rift, hops when a hidden cube is in view,
  // cheers when you open it and sulks when someone else does. Drag it, throw it, shake it.
  import { ANIMS, animOf, countShakes, FRAME, frameAt, grab, mood, newBody, release, sheetFor, SHEET_COLS, SHEET_ROWS, step,
    throwVelocity, type Anim, type Body, type Sample } from "../../domain/mascot.ts";
  import { untrack } from "svelte";
  import { ui } from "../state.svelte.ts";

  const SCALE = 2, SIZE = FRAME * SCALE;

  let width = $state(800), height = $state(600);
  const profile = $derived(ui.meter?.profile);
  const sheet = $derived(profile && ui.data.settings.mascot ? sheetFor(profile.job, ui.data.settings.mascotGender, profile.serverId) : null);

  let body = $state<Body | null>(null);
  let anim = $state<Anim>("idle"), frame = $state(0), hop = $state(0), shake = $state(0);
  let animStart = 0;

  // Pointer: grab, drag, throw, shake; a short press without moving is a click (a little hop).
  let samples: Sample[] = [];
  let grabX = 0, grabY = 0, down: Sample | null = null;

  $effect(() => {
    if (!sheet) { body = null; return; }
    // A new character (or class, or gender): it drops in from above.
    body = newBody(Math.random() * Math.max(0, untrack(() => width) - SIZE), Date.now()); // a resize doesn't drop it again
    let last = performance.now(), raf = 0;
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000), now = Date.now();
      last = t;
      const m = mood({ now, cues: ui.mascotCues, cubeInView: !!ui.meter?.cubes?.live.length, lastOpened: ui.meter?.cubes?.opened.at(-1) ?? null });
      let b = body!;
      // Something is going on: it stops walking and stays put.
      if (m && (b.state === "walk" || b.state === "idle")) b = { ...b, state: "idle", until: now + 1_000 };
      b = step(b, dt, now, width, height, SIZE, Math.random);
      body = b;
      const a = animOf(b, m);
      if (a !== anim) { anim = a; animStart = now; }
      const since = (now - animStart) / 1000;
      frame = frameAt(a, now - animStart);
      hop = a === "happy" ? Math.abs(Math.sin(since * Math.PI * 1.6)) * 28 : a === "celebrate" ? Math.abs(Math.sin(since * Math.PI * 2)) * 14 : 0;
      shake = a === "rift" || a === "shout" ? (Math.random() - 0.5) * 3 : 0;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  function pointerdown(e: PointerEvent) {
    if (!body || e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    grabX = e.clientX - body.x;
    grabY = (height - e.clientY) - body.y;
    down = { t: Date.now(), x: e.clientX, y: e.clientY };
    samples = [down];
    body = grab(body);
  }
  function pointermove(e: PointerEvent) {
    if (!body || body.state !== "held") return;
    const now = Date.now();
    samples = [...samples.filter((p) => now - p.t <= 1_000), { t: now, x: e.clientX, y: e.clientY }];
    const x = Math.min(width - SIZE, Math.max(0, e.clientX - grabX));
    if (Math.abs(x - body.x) > 1) body.dir = x > body.x ? 1 : -1;
    body.x = x;
    body.y = Math.min(height - SIZE, Math.max(0, height - e.clientY - grabY));
  }
  function pointerup(e: PointerEvent) {
    if (!body || body.state !== "held") return;
    const now = Date.now();
    const click = down && now - down.t < 300 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5;
    if (click) body = release(body, 0, 420, 0, now);
    else { const v = throwVelocity(samples); body = release(body, v.vx, v.vy, countShakes(samples, now), now); }
    down = null; samples = [];
  }
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />

{#if sheet && body}<div class="mascot-stage">
  {#if anim === "rift"}<i class="mascot-vortex" style:left="{body.dir > 0 ? body.x + SIZE - 6 : body.x - 70}px" style:bottom="{body.y + 8}px"></i>{/if}
  <button class="mascot" aria-label="Mascot: drag it, throw it, shake it" title="" style:left="{body.x + shake}px" style:bottom="{body.y + hop}px"
    style:width="{SIZE}px" style:height="{SIZE}px" style:background-image="url(/mascots/{sheet}.png)"
    style:background-size="{SHEET_COLS * SIZE}px {SHEET_ROWS * SIZE}px"
    style:background-position="-{frame * SIZE}px -{ANIMS[anim].row * SIZE}px" style:transform="scaleX({body.dir})"
    class:held={body.state === "held"} onpointerdown={pointerdown} onpointermove={pointermove} onpointerup={pointerup} onpointercancel={pointerup}></button>
</div>{/if}
