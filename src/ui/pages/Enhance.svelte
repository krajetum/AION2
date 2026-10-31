<script lang="ts">
  import { BASE_LEVEL, MAX_LEVEL, plan, SOURCES, VERIFIED } from "../../domain/enhance.ts";
  import { num } from "../format.ts";
  import Kpi from "../parts/Kpi.svelte";

  // Page state only: nothing here goes into the save file.
  let itemLevel = $state(BASE_LEVEL);
  let from = $state(0);
  let to = $state(MAX_LEVEL);
  let stonePrice = $state(0);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));
  const p = $derived(plan(clamp(itemLevel, 1, 999), from, to, Math.max(0, stonePrice || 0)));
  const short = (v: number) => (v >= 1e6 ? (v / 1e6).toFixed(v >= 1e8 ? 0 : 2) + "M" : num(Math.round(v)));
  const withStones = $derived(stonePrice > 0 ? "Kina + stones" : "Kina");
</script>

<div class="toolbar start">
  <label>Item level <input type="number" min="1" max="999" value={itemLevel} aria-label="Item level"
    onchange={(e) => { itemLevel = clamp(e.currentTarget.valueAsNumber, 1, 999); }}></label>
  <label>From <select value={from} onchange={(e) => { from = Number(e.currentTarget.value); if (to <= from) to = from + 1; }}>
    {#each Array.from({ length: MAX_LEVEL }, (_, i) => i) as n}<option value={n}>+{n}</option>{/each}</select></label>
  <label>To <select value={to} onchange={(e) => { to = Number(e.currentTarget.value); if (from >= to) from = to - 1; }}>
    {#each Array.from({ length: MAX_LEVEL }, (_, i) => i + 1) as n}<option value={n}>+{n}</option>{/each}</select></label>
  <label title="To count the Enhance Stones in Kina too: their market price, 0 = Kina only">Kina per Enhance Stone <input type="number" min="0"
    value={stonePrice} aria-label="Kina per Enhance Stone" onchange={(e) => { stonePrice = Math.max(0, e.currentTarget.valueAsNumber || 0); }}></label>
</div>
<p class="hint">Unique gear. Failing costs only the materials: the piece keeps its level. Each failure adds 5% to the next try at that step.</p>

<div class="kpis">
  <Kpi label="Expected Kina" value="≈ {short(p.kina)}" sub="{p.attempts.toFixed(1)} attempts on average" cls="hero" />
  <Kpi label="Expected Enhance Stones" value="≈ {short(p.stones)}" sub={stonePrice > 0 ? `≈ ${short(p.stones * stonePrice)} Kina` : "at your price, if you set one"} />
  <Kpi label="Lucky (10%)" value="≈ {short(p.lucky)}" sub="{withStones}: 1 run in 10 costs less" />
  <Kpi label="Typical (50%)" value="≈ {short(p.typical)}" sub="{withStones}: half the runs cost less" />
  <Kpi label="Unlucky (90%)" value="≈ {short(p.unlucky)}" sub="{withStones}: 1 run in 10 costs more" />
  <Kpi label="Worst case" value="≈ {short(p.worst)}" sub="{withStones}: every step at its last attempt" />
</div>

<section class="dps-table"><h2>Steps <span class="count">{p.steps.length}</span></h2>
  <div class="scroll"><table class="sheet">
    <thead><tr><th>Step</th><th class="n">Success</th><th class="n">Avg attempts</th><th class="n">Max attempts</th><th class="n">Kina / attempt</th><th class="n">Stones / attempt</th><th class="n">Expected Kina</th></tr></thead>
    <tbody>{#each p.steps as s (s.from)}<tr>
      <td>+{s.from} → +{s.from + 1}</td>
      <td class="n">{s.chance}%{#if s.chance < 100} <span class="dim">+5%/fail</span>{/if}</td>
      <td class="n">{s.avg.toFixed(2)}</td><td class="n">{s.max}</td>
      <td class="n">≈ {num(s.kina)}</td><td class="n">≈ {num(s.stones)}</td><td class="n">≈ {num(Math.round(s.kina * s.avg))}</td>
    </tr>{/each}</tbody>
  </table></div>
</section>

<p class="hint">Success chances: the Global client data and NCSOFT's Korean probability disclosure agree. Costs per attempt are those of an
  item level {BASE_LEVEL} Unique scaled by item level (within 1% of the sources' totals for item levels 36 to 102), so "≈".
  Checked {VERIFIED}:
  {#each SOURCES as src, i (src.url)}<a href={src.url} target="_blank" rel="noreferrer">{src.name}</a>{i < SOURCES.length - 1 ? " · " : "."}{/each}</p>
