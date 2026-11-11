<script lang="ts">
  // The winter theme's weather over the whole window (domain/holiday.ts): falling snow that piles up along the bottom edge,
  // and fireworks in the first minute of the new year. Never takes the pointer; stops with "reduce motion".
  import { newYearShow } from "../../domain/holiday.ts";
  import { ui } from "../state.svelte.ts";
  import { winterNow } from "../winter.ts";

  let canvas: HTMLCanvasElement;

  const fireworks = $derived(newYearShow(winterNow(ui.now)));
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const FLAKES = 90, COL = 6, DRIFT_MAX = 14; // px: the pile stays low, over the page's bottom padding
  type Flake = { x: number; y: number; r: number; vy: number; sway: number; phase: number };
  type Spark = { x: number; y: number; vx: number; vy: number; life: number; hue: number };

  $effect(() => {
    if (still) return;
    const ctx = canvas.getContext("2d")!;
    let w = 0, h = 0, raf = 0, last = performance.now(), nextRocket = 0;
    let drift: number[] = [], flakes: Flake[] = [], sparks: Spark[] = [];
    const flake = (top: boolean): Flake => ({ x: Math.random() * w, y: top ? -5 : Math.random() * h, r: 0.8 + Math.random() * 2,
      vy: 18 + Math.random() * 30, sway: 6 + Math.random() * 14, phase: Math.random() * 6.3 });
    const resize = () => {
      const dpr = devicePixelRatio || 1;
      w = innerWidth; h = innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drift = Array.from({ length: Math.ceil(w / COL) + 1 }, (_, i) => drift[i] ?? 0);
    };
    resize();
    flakes = Array.from({ length: FLAKES }, () => flake(false));
    addEventListener("resize", resize);

    const rocket = (t: number) => {
      const x = w * (0.15 + Math.random() * 0.7), y = h * (0.15 + Math.random() * 0.35), hue = Math.random() * 360;
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 160;
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, hue: hue + Math.random() * 40 });
      }
      nextRocket = t + 500 + Math.random() * 700;
    };

    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      ctx.clearRect(0, 0, w, h);
      // Snow: a flake that reaches the pile adds to it, the pile spreads a little to its neighbours.
      ctx.fillStyle = "rgba(240, 247, 255, 0.85)";
      for (const f of flakes) {
        f.y += f.vy * dt; f.phase += dt;
        const x = f.x + Math.sin(f.phase) * f.sway, c = Math.max(0, Math.min(drift.length - 1, Math.round(x / COL)));
        if (f.y >= h - drift[c]) {
          if (drift[c] < DRIFT_MAX) drift[c] += f.r * 0.25;
          Object.assign(f, flake(true));
          continue;
        }
        ctx.beginPath(); ctx.arc(x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 1; i < drift.length - 1; i++) {
        const avg = (drift[i - 1] + drift[i + 1]) / 2;
        if (drift[i] > avg + 1.5) { drift[i] -= 0.05; drift[i - 1] += 0.025; drift[i + 1] += 0.025; }
      }
      ctx.fillStyle = "rgba(236, 244, 255, 0.92)";
      ctx.beginPath(); ctx.moveTo(0, h);
      drift.forEach((d, i) => ctx.lineTo(i * COL, h - d));
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      // Fireworks: bursts of sparks that fall and fade.
      if (fireworks && t >= nextRocket) rocket(t);
      for (const s of sparks) {
        s.vy += 90 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.985; s.life -= dt * 0.7;
        ctx.fillStyle = `hsla(${s.hue}, 95%, 65%, ${Math.max(0, s.life)})`;
        ctx.fillRect(s.x, s.y, 2.5, 2.5);
      }
      sparks = sparks.filter((s) => s.life > 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); ctx.clearRect(0, 0, w, h); };
  });
</script>

<canvas class="winter-sky" bind:this={canvas} aria-hidden="true"></canvas>
