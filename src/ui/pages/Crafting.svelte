<script lang="ts">
  // Crafting page: a bill of materials for one or more targets (src/domain/crafting.ts): the selected character's stock
  // first, then crafts (nested recipes) and purchases at the market prices you set. Best case: every craft succeeds.
  import { addInput, addItem, exportRecipes, importRecipes, removeItem, renameItem, setBuy, setCode, setFee, setInputQty, setOwned, setPrice, setTarget, setYields } from "../../app/crafting.ts";
  import { craftCost, crafted, explode, takeGameRecipes, tree, type CraftItem, type GameRecipes, type Side } from "../../domain/crafting.ts";
  import { faction } from "../../domain/servers.ts";
  import { pickWallet } from "../../domain/wallet.ts";
  import { act, commit } from "../actions.ts";
  import { num } from "../format.ts";
  import { ICON } from "../icons.ts";
  import { showStatus } from "../overlays.ts";
  import Kpi from "../parts/Kpi.svelte";
  import { ui } from "../state.svelte.ts";

  const KINA = "930100031"; // unbound Kina: the one the market takes
  let view = $state<"bill" | "recipes">("bill"), shared = $state("");
  const c = $derived(ui.data.crafting);
  const char = $derived(ui.data.characters.find((x) => x.id === ui.charId)?.name ?? "");
  const owned = $derived(c.owned[char] ?? {});
  const bill = $derived(explode(c, owned));
  const nodes = $derived(tree(c, owned));
  const crafts = $derived(bill.lines.filter((l) => crafted(c.items[l.item])));
  const raws = $derived(bill.lines.filter((l) => !crafted(c.items[l.item])));
  const items = $derived(Object.values(c.items).sort((a, b) => a.name.localeCompare(b.name)));
  const kina = $derived(pickWallet(ui.data.wallets, char, ui.meter?.profile?.name)?.wallet.values[KINA]);
  // The game's recipes for your faction (the server's, else as last loaded): loaded on demand, the file is ~70 kB.
  let side = $state<Side>(ui.data.crafting.game?.side ?? (faction(ui.data.serverId ?? 0) || "Asmodian")), query = $state("");
  const SHOWN = 60; // items listed at once in Recipes: the game's are ~380
  const found = $derived(items.filter((it) => it.name.toLowerCase().includes(query.trim().toLowerCase())));
  const bundle = async () => (await import("../../assets/recipes.json")).default as unknown as GameRecipes;
  async function loadGame() {
    const g = await bundle();
    await act(() => showStatus(`${num(takeGameRecipes(ui.data.crafting, g, side))} ${side} recipes loaded`));
  }
  // Game recipes loaded from an older bundle (fixed recipes since, or newer game data): reloaded, your choices kept.
  $effect(() => {
    const was = c.game;
    if (was) bundle().then((g) => {
      if (was.rev !== g.rev || was.builtAt !== g.builtAt) act(() => showStatus(`${num(takeGameRecipes(ui.data.crafting, g, was.side))} ${was.side} recipes updated`));
    });
  });
  const day = (t?: number) => (t ? `Price set ${new Date(t).toLocaleDateString()}` : "Market price per piece");

  /** A change that may refuse (throws): the reason in the status line, nothing saved. */
  const attempt = (f: () => unknown) => act(() => { try { return f(); } catch (e) { showStatus((e as Error).message, true); return false; } });
  /** A small form's fields, then cleared. */
  function fields(e: SubmitEvent) {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement, v = Object.fromEntries(new FormData(f)) as Record<string, string>;
    f.reset();
    return v;
  }

  // Craft or buy: the cheaper one, when it isn't the one chosen (needs a price and priced inputs).
  function advice(it: CraftItem) {
    const made = craftCost(c, it.id);
    if (!it.recipe || it.price == null || made == null) return "";
    if (!it.buy && it.price < made) return `Buying is cheaper: ${num(it.price)} vs ${num(Math.round(made))} crafted`;
    if (it.buy && made < it.price) return `Crafting is cheaper: ${num(Math.round(made))} vs ${num(it.price)} bought`;
    return "";
  }
</script>

{#snippet craftOrBuy(it: CraftItem)}<span class="seg" role="group" aria-label="Craft or buy {it.name}">
  <button class:on={!it.buy} aria-pressed={!it.buy} onclick={() => act(() => setBuy(ui.data, it.id, false))}>Craft</button>
  <button class:on={!!it.buy} aria-pressed={!!it.buy} onclick={() => act(() => setBuy(ui.data, it.id, true))}>Buy</button></span>{/snippet}
{#snippet have(id: string)}<input type="number" min="0" value={owned[id] ?? ""} placeholder="0" aria-label="{c.items[id].name} owned by {char}"
  onchange={(e) => commit(e, (v) => setOwned(ui.data, char, id, v), () => c.owned[char]?.[id] ?? "")}>{/snippet}

{#snippet loader()}<div class="toolbar start">
  <div class="seg" role="group" aria-label="Faction">{#each ["Asmodian", "Elyos"] as const as f}
    <button class:on={side === f} aria-pressed={side === f} onclick={() => { side = f; }}>{f}</button>{/each}</div>
  <button onclick={loadGame}>{c.game ? "Reload" : "Load"} the game's recipes</button>
  <span class="hint">{c.game ? `${c.game.side} recipes loaded, game data of ${c.game.builtAt}.` : "All craftable items with their recipes, from the game client data (aion2hub)."}
    Your prices, stock and Craft/Buy choices stay.</span></div>{/snippet}

<div class="toolbar start"><div class="seg" role="group" aria-label="View">
  <button class:on={view === "bill"} aria-pressed={view === "bill"} onclick={() => { view = "bill"; }}>Bill of materials</button>
  <button class:on={view === "recipes"} aria-pressed={view === "recipes"} onclick={() => { view = "recipes"; }}>Recipes</button></div></div>
<datalist id="craft-items">{#each items as it (it.id)}<option value={it.name}></option>{/each}</datalist>

{#if view === "bill"}
<p class="hint intro">Each target's recipe tree, then what it all comes to: {char || "the selected character"}'s pieces first, then crafts, then purchases at the prices you set.
  Best case: every craft succeeds (a COMBO in game is a bonus on top). A material with no recipe and no price is one to farm (Bound ones).</p>
{#if !c.game}{@render loader()}{/if}
<div class="kpis">
  <Kpi label="To buy" value={num(bill.buyKina)} sub={bill.unpriced.length ? `${bill.unpriced.length} without a price` : "Kina at market prices"} />
  <Kpi label="Craft fees" value={num(bill.feeKina)} sub="Kina" />
  <Kpi label="Total" value={num(bill.total)} cls="hero"
    sub={kina == null ? "Kina" : kina >= bill.total ? `${num(kina)} Kina in the wallet` : `${num(bill.total - kina)} Kina short`} />
</div>

<section class="dps-table"><h2>Targets</h2>
  <div class="scroll"><table class="sheet">
    <tbody>{#each c.targets as t (t.item)}<tr>
      <td><b>{c.items[t.item].name}</b></td>
      <td class="n"><input type="number" min="0" value={t.qty} aria-label="How many {c.items[t.item].name}"
        onchange={(e) => commit(e, (v) => setTarget(ui.data, t.item, v), () => c.targets.find((x) => x.item === t.item)?.qty ?? 0)}></td>
      <td class="n"><button class="ghost" aria-label="Take {c.items[t.item].name} out" title="Take it out" onclick={() => act(() => setTarget(ui.data, t.item, "0"))}>{@html ICON.close}</button></td>
    </tr>{:else}<tr><td class="hint">No target yet: add what you want to craft.</td></tr>{/each}</tbody>
  </table></div>
  <form class="craft-add" onsubmit={(e) => { const v = fields(e); act(() => { const id = addItem(ui.data, v.name); if (!id) return false; setTarget(ui.data, id, v.qty); }); }}>
    <input name="name" list="craft-items" placeholder="Item to craft" aria-label="Item to craft" autocomplete="off" required>
    <input name="qty" type="number" min="1" value="1" aria-label="How many"><button>Add target</button></form>
</section>

{#if nodes.length}<section class="dps-table"><h2>Recipe tree</h2>
  <p class="hint">Every input right under the craft that takes it. Your pieces count where they are met first; a craft they cover has nothing under it.</p>
  <div class="scroll"><table class="sheet craft craft-tree">
    <thead><tr><th>Item</th><th class="n">Need</th><th class="n">Owned</th><th class="n">Crafts</th><th class="n">To get</th></tr></thead>
    <tbody>{#each nodes as n, i (i)}{@const it = c.items[n.item]}<tr class:done={n.used === n.need} class:top={!n.depth}>
      <td style:--depth={n.depth}><span class="name">{it.name}</span>{#if it.recipe && it.buy}<small class="dim"> bought</small>{/if}</td>
      <td class="n num">{num(n.need)}</td>
      <td class="n num">{n.used ? num(n.used) : ""}</td>
      <td class="n num">{n.craft ? `${num(n.craft)}×` : ""}</td>
      <td class="n num">{n.buy ? num(n.buy) : ""}{#if n.buy && it.price == null} <small class="dim">{it.recipe ? "no price" : "farm"}</small>{/if}</td>
    </tr>{/each}</tbody>
  </table></div></section>{/if}

{#if crafts.length}<section class="dps-table"><h2>Crafts <span class="count">{num(crafts.reduce((s, l) => s + l.craft, 0))}</span></h2>
  <div class="scroll"><table class="sheet craft">
    <thead><tr><th>Item</th><th class="n">Need</th><th class="n">Owned</th><th class="n">Crafts</th></tr></thead>
    <tbody>{#each crafts as l (l.item)}{@const it = c.items[l.item]}{@const tip = advice(it)}<tr class:done={l.used === l.need}>
      <td><span class="name">{it.name}</span> {@render craftOrBuy(it)}{#if tip}<small class="craft-tip">{tip}</small>{/if}</td>
      <td class="n num">{num(l.need)}</td>
      <td class="n">{@render have(l.item)}</td>
      <td class="n num">{l.craft ? `${num(l.craft)}×` : ""}</td>
    </tr>{/each}</tbody>
  </table></div></section>{/if}

{#if raws.length}<section class="dps-table"><h2>Materials to get <span class="count">{raws.length}</span></h2>
  <div class="scroll"><table class="sheet craft">
    <thead><tr><th>Material</th><th class="n">Need</th><th class="n">Owned</th><th class="n">To get</th><th class="n">Price</th><th class="n">Kina</th></tr></thead>
    <tbody>{#each raws as l (l.item)}{@const it = c.items[l.item]}{@const tip = advice(it)}<tr class:done={l.used === l.need}>
      <td><span class="name">{it.name}</span>{#if it.recipe} {@render craftOrBuy(it)}{/if}{#if tip}<small class="craft-tip">{tip}</small>{/if}</td>
      <td class="n num">{num(l.need)}</td>
      <td class="n">{@render have(l.item)}</td>
      <td class="n num">{l.buy ? num(l.buy) : ""}{#if l.buy && it.price == null} <small class="dim">{it.recipe ? "no price" : "farm"}</small>{/if}</td>
      <td class="n"><input class="price" type="number" min="0" value={it.price ?? ""} placeholder="—" title={day(it.priceAt)} aria-label="Market price of {it.name}"
        onchange={(e) => commit(e, (v) => setPrice(ui.data, it.id, v, Date.now()), () => c.items[it.id].price ?? "")}></td>
      <td class="n num">{l.cost ? num(l.cost) : ""}</td>
    </tr>{/each}</tbody>
  </table></div></section>{/if}

{:else}
<p class="hint intro">Every item, raw or crafted: a recipe is what one craft takes. An input typed that doesn't exist yet is added as a new item.
  The item code is the game's (aion2hub shows it in the item's link), for reading your inventory in a later version.</p>
{@render loader()}
<section class="dps-table"><h2>Items <span class="count">{items.length}</span></h2>
  <input class="craft-search" type="search" placeholder="Search an item" aria-label="Search an item" autocomplete="off" bind:value={query}>
  <form class="craft-add" onsubmit={(e) => { const v = fields(e); act(() => addItem(ui.data, v.name) ? undefined : false); }}>
    <input name="name" placeholder="New item" aria-label="New item" autocomplete="off" required><button>Add item</button></form>
  {#each found.slice(0, SHOWN) as it (it.id)}<details class="craft-item"><summary><b>{it.name}</b>
    <span class="dim">{it.recipe ? `${it.recipe.inputs.length} input${it.recipe.inputs.length === 1 ? "" : "s"}` : "material"}{it.price != null ? ` · ${num(it.price)} Kina` : ""}</span></summary>
    <div class="craft-fields">
      <label>Name <input value={it.name} autocomplete="off" onchange={(e) => commit(e, (v) => renameItem(ui.data, it.id, v), () => c.items[it.id].name)}></label>
      <label>Item code <input value={it.code ?? ""} inputmode="numeric" placeholder="e.g. 600590001" autocomplete="off" onchange={(e) => commit(e, (v) => setCode(ui.data, it.id, v), () => c.items[it.id].code ?? "")}></label>
      <label>Market price <input type="number" min="0" value={it.price ?? ""} placeholder="—" title={day(it.priceAt)} onchange={(e) => commit(e, (v) => setPrice(ui.data, it.id, v, Date.now()), () => c.items[it.id].price ?? "")}></label>
      {#if it.recipe}<label>Pieces per craft <input type="number" min="1" value={it.recipe.yields} onchange={(e) => commit(e, (v) => setYields(ui.data, it.id, v), () => c.items[it.id].recipe?.yields)}></label>
      <label>Kina per craft <input type="number" min="0" value={it.recipe.kina} onchange={(e) => commit(e, (v) => setFee(ui.data, it.id, v), () => c.items[it.id].recipe?.kina)}></label>{/if}
      <button class="ghost" onclick={() => attempt(() => removeItem(ui.data, it.id))}>Delete item</button>
    </div>
    {#if it.recipe}<table class="sheet"><tbody>{#each it.recipe.inputs as i (i.item)}<tr>
      <td class="n"><input type="number" min="0" value={i.qty} aria-label="{c.items[i.item].name} per craft"
        onchange={(e) => commit(e, (v) => setInputQty(ui.data, it.id, i.item, v), () => c.items[it.id].recipe?.inputs.find((x) => x.item === i.item)?.qty ?? 0)}></td>
      <td>{c.items[i.item].name}</td></tr>{/each}</tbody></table>{/if}
    <form class="craft-add" onsubmit={(e) => { const v = fields(e); attempt(() => { const id = addItem(ui.data, v.name); if (!id) return false; addInput(ui.data, it.id, id, Math.max(1, Math.floor(Number(v.qty)) || 1)); }); }}>
      <input name="qty" type="number" min="1" value="1" aria-label="How many per craft">
      <input name="name" list="craft-items" placeholder="Input (item or new name)" aria-label="Input" autocomplete="off" required><button>Add input</button></form>
  </details>{/each}
  {#if found.length > SHOWN}<p class="hint">{num(found.length - SHOWN)} more: search to narrow the list.</p>{/if}
</section>

<section class="dps-table"><h2>Share recipes</h2>
  <p class="hint">Copy your items and recipes (no prices, no stock) for a friend, or paste theirs: the same item gets their recipe, prices and stock stay yours.</p>
  <div class="craft-add">
    <button class="ghost" onclick={() => { navigator.clipboard.writeText(exportRecipes(ui.data)).then(() => showStatus("Recipes copied"), () => showStatus("Copy failed", true)); }}>Copy my recipes</button></div>
  <textarea class="craft-share" bind:value={shared} rows="3" placeholder="Paste shared recipes here" aria-label="Shared recipes"></textarea>
  <div class="craft-add"><button disabled={!shared.trim()} onclick={() => attempt(() => { const n = importRecipes(ui.data, shared); shared = ""; showStatus(`${n} item${n === 1 ? "" : "s"} imported`); })}>Import</button></div>
</section>
{/if}
