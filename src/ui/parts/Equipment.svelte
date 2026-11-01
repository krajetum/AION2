<script lang="ts">
  // A character's equipment from the official profile (infra/armory.ts): gear and accessories (click a piece for its
  // details), arcana, pet and wings, skills and stigma. As the site shows them.
  import type { Equipment, ItemDetail, Piece, Skill } from "../../domain/armory.ts";
  import { equipmentOf, itemOf } from "../../infra/armory.ts";

  let { characterId, serverId }: { characterId: string; serverId: number } = $props();

  let eq = $state<Equipment | null>(null), failed = $state(""), loading = $state(true);
  $effect(() => {
    const id = characterId, server = serverId;
    let live = true;
    eq = null; failed = ""; loading = true; openSlot = null;
    equipmentOf(id, server).then((v) => { if (live) { eq = v; if (!v) failed = "the site sent no equipment"; } },
      (e) => { if (live) failed = e instanceof Error ? e.message : String(e); }).finally(() => { if (live) loading = false; });
    return () => { live = false; };
  });

  // One piece's details open at a time.
  let openSlot = $state<number | null>(null);
  let detail = $state<{ state: "loading" } | { state: "done"; v: ItemDetail | null } | { state: "failed"; why: string }>({ state: "loading" });
  function toggle(p: Piece) {
    if (openSlot === p.slot) { openSlot = null; return; }
    openSlot = p.slot; detail = { state: "loading" };
    const slot = p.slot;
    itemOf(p, characterId, serverId).then((v) => { if (openSlot === slot) detail = { state: "done", v }; },
      (e) => { if (openSlot === slot) detail = { state: "failed", why: e instanceof Error ? e.message : String(e) }; });
  }
  const plus = (p: Piece) => (p.enchant || p.exceed ? `+${p.enchant}` : "");
</script>

{#snippet item(p: Piece)}
  <li class="eq-piece">
    <button class="eq-row" aria-expanded={openSlot === p.slot} onclick={() => toggle(p)}>
      {#if p.icon}<img src={p.icon} alt="" width="32" height="32" loading="lazy">{/if}
      {#if p.exceed}<span class="eq-exceed" title="Levels past the enchant cap">◆{p.exceed}</span>{/if}
      <span class="grade-{p.grade}">{plus(p)} {p.name}</span></button>
    {#if openSlot === p.slot}<div class="eq-detail">
      {#if detail.state === "loading"}<p class="hint">Reading the piece…</p>
      {:else if detail.state === "failed"}<p class="hint">Not read ({detail.why}).</p>
      {:else if detail.v}{@const d = detail.v}
        <p class="dim">{d.category}{d.level != null ? ` · item level ${d.level}` : ""}{d.maxEnchant != null ? ` · max +${d.maxEnchant}` : ""}</p>
        {#if d.main.length}<ul>{#each d.main as s}<li>{s.name} <b>{s.value}</b>{#if s.extra && s.extra !== "0" && s.extra !== "0%"} <span class="dim">(+{s.extra}{s.exceed ? " exceed" : ""})</span>{/if}</li>{/each}</ul>{/if}
        {#if d.sub.length}<h4>Bonus stats</h4><ul>{#each d.sub as s}<li>{s.name} <b>{s.value}</b></li>{/each}</ul>{/if}
        {#if d.manastones.length}<h4>Manastones</h4><ul>{#each d.manastones as s}<li class="grade-{s.grade}">{s.name} {s.value}</li>{/each}</ul>{/if}
        {#if d.godstones.length}<h4>Godstones</h4><ul>{#each d.godstones as s}<li><span class="grade-{s.grade}">{s.name}</span><br><small class="dim">{s.desc}</small></li>{/each}</ul>{/if}
        {#if d.skills.length}<h4>Skills</h4><ul>{#each d.skills as s}<li>{s.name} <b>+{s.level ?? "?"}</b></li>{/each}</ul>{/if}
        {#if d.set}<h4>{d.set.name} <span class="dim">({d.set.equipped} equipped)</span></h4><ul>
          {#each d.set.bonuses as b}<li class:dim={d.set.equipped < b.pieces}>{b.pieces} pieces: {b.text.join(" · ")}</li>{/each}</ul>{/if}
      {:else}<p class="hint">The site sent no details.</p>{/if}
    </div>{/if}
  </li>
{/snippet}

{#snippet skills(title: string, list: Skill[], stigma = false)}
  {#if list.length}<h3>{title}</h3><div class="eq-skills">
    {#each list as s (s.id)}<span class="eq-skill" class:locked={s.level === 0} title="{s.name}{s.level ? ` · level ${s.level}` : ' · not learned'}{stigma && s.equipped ? ' · equipped' : ''}">
      {#if s.icon}<img src={s.icon} alt="" width="40" height="40" loading="lazy">{/if}
      {#if stigma && s.equipped}<i class="eq-e">E</i>{/if}{#if s.level}<small>Lv {s.level}</small>{:else}<small>🔒</small>{/if}</span>{/each}
  </div>{/if}
{/snippet}

{#if loading}<p class="hint">Reading the equipment…</p>
{:else if failed}<p class="hint">Equipment not read ({failed}).</p>
{:else if eq}
  <div class="eq-cols">
    <div><h3>Gear</h3><ul class="eq-list">{#each eq.gear as p (p.slot)}{@render item(p)}{/each}</ul></div>
    <div><h3>Accessories</h3><ul class="eq-list">{#each eq.accessories as p (p.slot)}{@render item(p)}{/each}</ul></div>
  </div>
  <div class="eq-cols">
    {#if eq.arcana.length}<div><h3>Arcana</h3><ul class="eq-list">{#each eq.arcana as p (p.slot)}{@render item(p)}{/each}</ul></div>{/if}
    {#if eq.pet || eq.wing}<div><h3>Pet / Wings</h3><ul class="eq-list">
      {#if eq.pet}<li class="eq-row">{#if eq.pet.icon}<img src={eq.pet.icon} alt="" width="32" height="32" loading="lazy">{/if}{eq.pet.name}{eq.pet.level != null ? ` Lv ${eq.pet.level}` : ""}</li>{/if}
      {#if eq.wing}<li class="eq-row">{#if eq.wing.icon}<img src={eq.wing.icon} alt="" width="32" height="32" loading="lazy">{/if}<span class="grade-{eq.wing.grade}">{eq.wing.name}</span></li>{/if}
    </ul></div>{/if}
  </div>
  {@render skills("Active skills", eq.active)}
  {@render skills("Passive skills", eq.passive)}
  {@render skills("Stigma", eq.stigma, true)}
{/if}
