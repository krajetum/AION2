<script lang="ts" module>
  /** One drawn line: a value per second. `color` = any CSS colour, or a token name ("--dps"). */
  export interface ChartLine { name: string; values: number[]; color: string; dashed?: boolean }
  /** A death on the fight's clock (seconds), drawn as a red line with a skull. */
  export interface ChartDeath { t: number; name: string }
</script>

<script lang="ts">
  // A fight second by second on uPlot (canvas): each line smoothed over a few seconds, the party's sum as a dashed
  // filled area, the boss's HP on the right axis (0-100%), deaths as red lines with a skull, a legend that hides a
  // line on click and a tooltip under the cursor. The plot is made once per set of lines; each update only
  // replaces its data (setData), cheap enough for the meter's 5 updates a second.
  import uPlot from "uplot";
  import "uplot/dist/uPlot.min.css";
  import { SvelteSet } from "svelte/reactivity";
  import { clock, short } from "../../../domain/meter.ts";
  import { smooth } from "../../../domain/timeline.ts";

  let { lines, party = false, hp, deaths = [], height = 240, smoothing = 5, label = "Damage per second over the fight" }: {
    lines: ChartLine[]; party?: boolean; hp?: number[]; deaths?: ChartDeath[]; height?: number; smoothing?: number; label?: string;
  } = $props();

  let box = $state<HTMLDivElement>()!;
  let plot: uPlot | undefined;
  let plotKey = "";
  const hidden = new SvelteSet<number>(); // series indexes turned off in the legend
  let cur = $state<{ idx: number; left: number } | null>(null);

  const token = (c: string) => (c.startsWith("--") ? getComputedStyle(document.documentElement).getPropertyValue(c).trim() : c);
  /** A hex colour with an alpha, for the canvas (no color-mix there). */
  function alpha(c: string, a: number) {
    const h = token(c).replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(h)) return token(c);
    const n = parseInt(h, 16);
    return `rgb(${n >> 16} ${(n >> 8) & 255} ${n & 255} / ${a})`;
  }

  /** The legend's entries, in uPlot's series order (index 0 = the x axis). */
  const legend = $derived([
    ...lines.map((l) => ({ name: l.name, color: l.color, dashed: !!l.dashed, kind: "line" })),
    ...(party ? [{ name: "Party DPS", color: "--muted-foreground", dashed: true, kind: "party" }] : []),
    ...(hp ? [{ name: "Boss HP", color: "--taken", dashed: true, kind: "hp" }] : []),
  ]);

  function data(): uPlot.AlignedData {
    const len = Math.max(0, ...lines.map((l) => l.values.length), hp?.length ?? 0);
    const xs = Array.from({ length: len }, (_, i) => i);
    const fit = (v: number[]) => xs.map((i) => v[i] ?? null);
    const drawn = lines.map((l) => fit(smoothing > 1 ? smooth(l.values, smoothing) : l.values));
    const out: (number | null)[][] = [xs, ...drawn];
    if (party) out.push(xs.map((i) => drawn.reduce((a, s) => a + (s[i] ?? 0), 0)));
    if (hp) out.push(fit(hp));
    return out as uPlot.AlignedData;
  }

  function options(width: number): uPlot.Options {
    const muted = token("--muted-foreground"), grid = token("--border"), taken = token("--taken");
    const font = `11px ${getComputedStyle(document.body).fontFamily}`;
    const axis = { stroke: muted, font, grid: { stroke: grid, width: 1 }, ticks: { show: false } };
    return {
      width, height, legend: { show: false },
      cursor: { points: { size: 6 }, drag: { x: false, y: false } },
      scales: { x: { time: false }, y: { range: (_u, _min, max) => [0, max > 0 ? max * 1.1 : 1] }, hp: { range: [0, 100] } },
      axes: [
        { ...axis, space: 60, incrs: [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200], values: (_u, v) => v.map((s) => clock(s * 1000)) },
        { ...axis, size: 52, values: (_u, v) => v.map((n) => short(n)) },
        ...(hp ? [{ ...axis, scale: "hp", side: 1, size: 44, grid: { show: false }, values: (_u: uPlot, v: number[]) => v.map((n) => `${n}%`) }] : []),
      ],
      series: [
        {},
        ...lines.map((l) => ({ label: l.name, stroke: token(l.color), width: 1.5, dash: l.dashed ? [6, 4] : undefined, points: { show: false } })),
        ...(party ? [{ label: "Party DPS", stroke: muted, width: 1, dash: [4, 4], fill: alpha("--muted-foreground", 0.12), points: { show: false } }] : []),
        ...(hp ? [{ label: "Boss HP", scale: "hp", stroke: taken, width: 1.5, dash: [2, 3], points: { show: false } }] : []),
      ],
      hooks: {
        setCursor: [(u) => { cur = u.cursor.idx == null ? null : { idx: u.cursor.idx, left: u.cursor.left ?? 0 }; }],
        draw: [(u) => {
          const { ctx, bbox } = u, dpr = devicePixelRatio || 1;
          ctx.save();
          ctx.strokeStyle = taken; ctx.fillStyle = taken; ctx.lineWidth = dpr;
          ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `${10 * dpr}px sans-serif`;
          for (const d of deaths) {
            const x = Math.round(u.valToPos(d.t, "x", true));
            if (x < bbox.left || x > bbox.left + bbox.width) continue;
            ctx.beginPath(); ctx.moveTo(x, bbox.top + 9 * dpr); ctx.lineTo(x, bbox.top + bbox.height); ctx.stroke();
            ctx.beginPath(); ctx.arc(x, bbox.top + 2 * dpr, 7 * dpr, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = token("--background"); ctx.fillText("☠", x, bbox.top + 2.5 * dpr); ctx.fillStyle = taken;
          }
          ctx.restore();
        }],
      },
    };
  }

  // A new plot when the set of lines changes; otherwise only new data.
  $effect(() => {
    const d = data();
    const key = [legend.map((l) => l.name + l.color).join("|"), height].join("#");
    if (plot && key === plotKey) { plot.setData(d); return; }
    plot?.destroy();
    hidden.clear();
    plot = new uPlot(options(box.clientWidth || 600), d, box);
    plotKey = key;
  });
  $effect(() => {
    const ro = new ResizeObserver(() => plot?.setSize({ width: box.clientWidth, height }));
    ro.observe(box);
    return () => { ro.disconnect(); plot?.destroy(); plot = undefined; };
  });

  function toggle(i: number) {
    const on = hidden.has(i);
    if (on) hidden.delete(i); else hidden.add(i);
    plot?.setSeries(i + 1, { show: on });
  }
  const tip = $derived.by(() => {
    if (!cur || !plot) return null;
    const d = plot.data, i = cur.idx;
    const rows = legend.map((l, k) => ({ ...l, v: d[k + 1]?.[i] })).filter((r, k) => r.v != null && !hidden.has(k));
    return { at: clock(i * 1000), rows: rows.sort((a, b) => (a.kind === "hp" ? 1 : b.kind === "hp" ? -1 : (b.v ?? 0) - (a.v ?? 0))) };
  });
</script>

<figure class="relative m-0" aria-label={label}>
  <div bind:this={box} class="w-full" style:height="{height}px" role="img" aria-label={label} onmouseleave={() => { cur = null; }}></div>
  {#if tip && cur}
    <div class="pointer-events-none absolute top-2 z-10 min-w-40 rounded-md border bg-popover px-2.5 py-2 text-xs shadow-lg"
      style:left="{cur.left + 72}px" style:transform={cur.left > (box?.clientWidth ?? 0) / 2 ? "translateX(calc(-100% - 24px))" : ""}>
      <div class="mb-1 font-medium tabular-nums text-muted-foreground">{tip.at}</div>
      {#each tip.rows as r}<div class="flex items-center gap-2 tabular-nums">
        <span class="size-2 shrink-0 rounded-full" style:background={token(r.color)}></span>
        <span class="flex-1 truncate">{r.name}</span><span>{r.kind === "hp" ? `${r.v}%` : `${short(r.v ?? 0)}/s`}</span></div>{/each}
    </div>
  {/if}
  <figcaption class="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
    {#each legend as l, i}<button type="button" data-slot="legend-item" class="flex items-center gap-1.5 hover:text-foreground" class:opacity-40={hidden.has(i)}
        aria-pressed={!hidden.has(i)} onclick={() => toggle(i)}>
      <span class="inline-block h-0 w-3.5 border-t-2" class:border-dashed={l.dashed} style:border-color={token(l.color)}></span>{l.name}</button>{/each}
  </figcaption>
</figure>
