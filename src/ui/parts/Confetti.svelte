<script lang="ts">
  // A burst of confetti over the whole window for a small win (ui.party: a list finished, a personal best).
  // Draws only while pieces are in the air; never takes the pointer; nothing with "reduce motion".
  import { ui } from "../state.svelte.ts";

  let canvas: HTMLCanvasElement;
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  type Piece = { x: number; y: number; vx: number; vy: number; life: number; hue: number; spin: number };

  $effect(() => {
    if (!ui.party || still) return;
    const ctx = canvas.getContext("2d")!, dpr = devicePixelRatio || 1, w = innerWidth, h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Two cannons in the bottom corners, firing up and inwards.
    const pieces: Piece[] = Array.from({ length: 140 }, (_, i) => {
      const left = i % 2 === 0, a = (left ? -Math.PI / 3 : -2 * Math.PI / 3) + (Math.random() - 0.5) * 0.9, v = 500 + Math.random() * 600;
      return { x: left ? 0 : w, y: h, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, hue: Math.random() * 360, spin: Math.random() * 6.3 };
    });
    let last = performance.now(), raf = 0;
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const p of pieces) {
        if (p.life <= 0) continue;
        alive = true;
        p.vy += 900 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.spin += dt * 8; p.life -= dt * 0.45;
        ctx.fillStyle = `hsla(${p.hue}, 90%, 65%, ${Math.min(1, p.life * 2)})`;
        ctx.fillRect(p.x, p.y, 7 * Math.abs(Math.cos(p.spin)) + 2, 5); // a flat piece turning in the air
      }
      if (alive) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, w, h); };
  });
</script>

<canvas class="fx-layer" bind:this={canvas} aria-hidden="true"></canvas>
