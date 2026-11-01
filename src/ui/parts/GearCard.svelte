<script lang="ts">
  // One equipped piece as a card (Players page). Front: the piece and its bonus lines, ideal ones ticked.
  // The BiS button turns it over: the ideal lines for the player's class and this slot (domain/bis.ts), which of them
  // the piece has, and an editor for the player's own list.
  import type { ItemDetail, Piece } from "../../domain/armory.ts";
  import { checkBis, idealNames, isIdeal, slotLabel, type BisLine } from "../../domain/bis.ts";

  let { p, slot, detail, failed, lines, custom, className, save }: {
    p: Piece; slot: string | null; detail: ItemDetail | null | undefined; failed: string;
    lines: BisLine[] | null; custom: boolean; className: string;
    save: (lines: BisLine[] | null) => void;
  } = $props();

  let flipped = $state(false), editing = $state(false);
  let draft = $state<BisLine[]>([]);
  const names = $derived(idealNames(lines));
  const check = $derived(lines ? checkBis(lines, detail ?? null) : null);
  const plus = $derived(p.enchant || p.exceed ? `+${p.enchant}` : "");
  // Arcana show their skills; the rest their bonus stats.
  const own = $derived(detail ? [...detail.sub.map((s) => ({ name: s.name, value: s.value })),
    ...detail.skills.map((s) => ({ name: s.name, value: s.level != null ? `+${s.level}` : "" }))] : []);
  const label = $derived(slot ? slotLabel(slot) : p.slotName);

  function edit() { draft = (lines ?? []).map((l) => ({ ...l })); editing = true; }
  function done(v: BisLine[] | null) { save(v); editing = false; }
</script>

<div class="gcard grade-edge-{p.grade}" class:flipped>
  <div class="gcard-inner">
    <!-- Front: the piece -->
    <section class="gface front" aria-hidden={flipped} inert={flipped}>
      <header>
        {#if p.icon}<img src={p.icon} alt="" width="44" height="44" loading="lazy">{:else}<span class="gicon"></span>{/if}
        <div class="gtitle"><b class="grade-{p.grade}">{plus} {p.name}</b>
          <small>{label}{#if p.exceed} · <span class="eq-exceed" title="Levels past the enchant cap">◆{p.exceed}</span>{/if}</small></div>
        {#if lines}<button class="bis-btn" title="Best in slot for a {className}" onclick={() => { flipped = true; }}>BiS</button>{/if}
      </header>
      {#if detail === undefined && !failed}<p class="hint">Reading…</p>
      {:else if failed}<p class="hint">Not read ({failed}).</p>
      {:else if detail}
        <ul class="glines">{#each own as s (s.name)}<li class:ideal={isIdeal(names, s.name)}>
          <span class="tick">{isIdeal(names, s.name) ? "✓" : ""}</span><span>{s.name}</span><b>{s.value}</b></li>
        {:else}<li class="dim">No bonus lines.</li>{/each}</ul>
        {#if detail.manastones.length}<div class="gstones">{#each detail.manastones as m}<span class="grade-{m.grade}" title="Manastone">{m.name} {m.value}</span>{/each}</div>{/if}
        {#if detail.godstones.length}<div class="gstones">{#each detail.godstones as g}<span class="grade-{g.grade}" title={g.desc}>{g.name}</span>{/each}</div>{/if}
        {#if detail.set}<p class="dim gset">{detail.set.name} · {detail.set.equipped} equipped</p>{/if}
      {/if}
      {#if check}<footer><span>{check.has} of {check.lines.length} ideal lines</span></footer>{/if}
    </section>

    <!-- Back: best in slot -->
    {#if lines}<section class="gface back" aria-hidden={!flipped} inert={!flipped}>
      <header>
        <span class="gstar">★</span>
        <div class="gtitle"><b>Ideal {className} {label}</b><small>Best in slot{custom ? " · your list" : ""}</small></div>
        {#if !editing}<button class="ghost gedit" title="Edit this list" onclick={edit}>Edit</button>{/if}
      </header>
      {#if editing}
        <div class="gedit-rows">{#each draft as l, i}<div>
          <input bind:value={l.stat} placeholder="Stat or skill" aria-label="Line {i + 1}">
          <input bind:value={l.value} placeholder="Value" aria-label="Value {i + 1}" class="val">
          <button class="ghost" aria-label="Remove line {i + 1}" onclick={() => { draft = draft.filter((_, k) => k !== i); }}>×</button></div>{/each}
          <button class="ghost" onclick={() => { draft = [...draft, { stat: "", value: "" }]; }}>+ Add line</button></div>
        <footer class="gedit-actions">
          <button class="primary" onclick={() => done(draft)}>Save</button>
          <button class="ghost" onclick={() => { editing = false; }}>Cancel</button>
          {#if custom}<button class="ghost" title="Back to the bundled list" onclick={() => done(null)}>Reset</button>{/if}
        </footer>
      {:else if check}
        <ul class="bis-lines">{#each check.lines as c (c.line.stat)}<li class:have={c.yours != null}>
          <span class="tick">{c.yours != null ? "✓" : ""}</span>
          <span class="name">{c.line.stat} {c.line.value}{#if c.yours != null && c.yours !== c.line.value}<small class="dim"> · yours {c.yours}</small>{/if}</span>
          {#if c.line.pct != null}<span class="pct">{c.line.pct}%</span>{/if}
          <i class="bar" style:--w="{c.line.pct ?? 100}%"></i></li>{/each}</ul>
        <footer><span>Yours has {check.has} of {check.lines.length}</span>
          <button class="ghost yours-btn" onclick={() => { flipped = false; }}>↻ Yours</button></footer>
      {/if}
    </section>{/if}
  </div>
</div>
