<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { NativeSelect, NativeSelectOption } from "$lib/components/ui/native-select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import Intro from "$lib/components/app/Intro.svelte";
  import Panel from "$lib/components/app/Panel.svelte";
  import UnderlineTabs from "$lib/components/app/UnderlineTabs.svelte";
  const VIEWS = [["bill", "Bill of materials"], ["recipes", "Recipes"]] as const;
  // Crafting page: a bill of materials for one or more targets (src/domain/crafting.ts): the selected character's stock
  // first, then crafts (nested recipes) and purchases at the market prices you set. Best case: every craft succeeds.
  import { addInput, addItem, exportRecipes, fillOwned, importRecipes, removeItem, renameItem, setBuy, setCode, setFee, setInputQty, setOwned, setPrice, setTarget, setYields } from "../../app/crafting.ts";
  import { CATEGORIES, ICON_BASE, craftCost, crafted, explode, takeGameRecipes, tree, type CraftItem, type GameRecipes, type Side } from "../../domain/crafting.ts";
  import { faction } from "../../domain/servers.ts";
  import { owned as gameOwned, pickWallet } from "../../domain/wallet.ts";
  import { meterItemCodes } from "../../infra/meter.ts";
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
  // Recipes' filters: a category ("Custom" = items you added, which have none) and a profession; the category is remembered.
  const CAT_KEY = "aion2-crafting-category";
  let cat = $state("All"), prof = $state("");
  $effect(() => { try { const s = localStorage.getItem(CAT_KEY); if (s) cat = s; } catch { /* default */ } });
  function pickCat(v: string) { cat = v; try { localStorage.setItem(CAT_KEY, v); } catch { /* not kept */ } }
  const inCat = (it: CraftItem, k: string) => k === "All" || (k === "Custom" ? !it.cat : it.cat === k);
  const cats = $derived(["All", ...CATEGORIES, "Custom"].map((k) => [k, items.filter((it) => inCat(it, k)).length] as const).filter(([k, n]) => k === "All" || n));
  const profs = $derived([...new Set(items.map((it) => it.prof).filter((p): p is string => !!p))].sort());
  const found = $derived(items.filter((it) => inCat(it, cat) && (!prof || it.prof === prof) && it.name.toLowerCase().includes(query.trim().toLowerCase())));
  // Bill of materials' item picker: the same filters, matches grouped by category with their icons.
  const PICKS = 40;
  let pick = $state(""), open = $state(false);
  const chosen = $derived(items.find((it) => it.name.toLowerCase() === pick.trim().toLowerCase()));
  const pickAll = $derived(items.filter((it) => inCat(it, cat) && (!prof || it.prof === prof) && it.name.toLowerCase().includes(pick.trim().toLowerCase())));
  const picks = $derived.by(() => {
    const shown = pickAll.slice(0, PICKS);
    return [...CATEGORIES, "Custom"].map((g) => [g, shown.filter((it) => (it.cat ?? "Custom") === g)] as const).filter(([, l]) => l.length);
  });
  const pickMore = $derived(Math.max(0, pickAll.length - PICKS));
  // The selected character's inventory as the meter last read it (desktop app, in game): "Fill from game".
  const inv = $derived(Object.entries(ui.data.wallets).find(([k]) => char && k.trim().toLowerCase() === char.trim().toLowerCase())?.[1]);
  const fill = () => act(() => { if (!inv?.items) return false; showStatus(`${num(fillOwned(ui.data, char, gameOwned(inv)))} items filled from ${char}'s bag and warehouse`); });
  const bundle = async () => (await import("../../assets/recipes.json")).default as unknown as GameRecipes;
  async function loadGame() {
    const g = await bundle();
    await act(() => showStatus(`${num(takeGameRecipes(ui.data.crafting, g, side))} ${side} recipes loaded`));
    meterItemCodes(ui.data.crafting.items).catch(() => {});
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

{#snippet pic(it: CraftItem)}{#if it.icon}<img class="mr-1.5 inline-block size-6 rounded-sm border align-middle grade-edge-{it.grade}" style="border-color: var(--edge, var(--border))" src={ICON_BASE + it.icon} alt="" width="24" height="24" loading="lazy">{/if}{/snippet}
{#snippet seg(label: string, items: readonly (readonly [string, string])[], value: string, set: (v: string) => void, size: "sm" | "xs" = "sm")}
  <ToggleGroup.Root type="single" variant="outline" size={size === "xs" ? "sm" : size} class={size === "xs" ? "ml-2 inline-flex align-middle [&_button]:h-6 [&_button]:text-xs" : "flex-wrap"} aria-label={label} {value} onValueChange={(v) => v && set(v)}>
    {#each items as [id, text]}<ToggleGroup.Item value={id}>{text}</ToggleGroup.Item>{/each}</ToggleGroup.Root>{/snippet}
{#snippet filters()}<div class="mt-2.5 flex flex-wrap items-center gap-2">
    <ToggleGroup.Root type="single" variant="outline" size="sm" class="flex-wrap" aria-label="Category" value={cat} onValueChange={(v) => v && pickCat(v)}>
      {#each cats as [k, n] (k)}<ToggleGroup.Item value={k}>{k} <span class="text-xs text-muted-foreground">{num(n)}</span></ToggleGroup.Item>{/each}</ToggleGroup.Root>
    {#if profs.length}<NativeSelect size="sm" bind:value={prof} aria-label="Profession"><NativeSelectOption value="">All professions</NativeSelectOption>{#each profs as p (p)}<NativeSelectOption value={p}>{p}</NativeSelectOption>{/each}</NativeSelect>{/if}</div>{/snippet}
{#snippet craftOrBuy(it: CraftItem)}{@render seg(`Craft or buy ${it.name}`, [["craft", "Craft"], ["buy", "Buy"]], it.buy ? "buy" : "craft", (v) => act(() => setBuy(ui.data, it.id, v === "buy")), "xs")}{/snippet}
{#snippet have(id: string)}<Input class="ml-auto h-7 w-20" type="number" min="0" value={owned[id] ?? ""} placeholder="0" aria-label="{c.items[id].name} owned by {char}"
  onchange={(e) => commit(e, (v) => setOwned(ui.data, char, id, v), () => c.owned[char]?.[id] ?? "")} />{/snippet}
{#snippet tip(text: string)}<small class="block text-xs text-gold">{text}</small>{/snippet}
{#snippet extra(text: string)}<small class="text-xs text-muted-foreground">{text}</small>{/snippet}

{#snippet loader()}<div class="mb-3 flex flex-wrap items-center gap-2">
  {@render seg("Faction", [["Asmodian", "Asmodian"], ["Elyos", "Elyos"]], side, (v) => { side = v as typeof side; })}
  <Button variant="outline" size="sm" onclick={loadGame}>{c.game ? "Reload" : "Load"} the game's recipes</Button>
  <span class="text-xs text-muted-foreground">{c.game ? `${c.game.side} recipes loaded, game data of ${c.game.builtAt}.` : "All craftable items with their recipes, from the game client data (aion2hub)."}
    Your prices, stock and Craft/Buy choices stay.</span></div>{/snippet}

<div class="mb-3"><UnderlineTabs label="View" items={VIEWS} value={view} onchange={(v) => { view = v; }} /></div>
<datalist id="craft-items">{#each items as it (it.id)}<option value={it.name}></option>{/each}</datalist>

{#if view === "bill"}
<Intro><p>Each target's recipe tree, then what it all comes to: {char || "the selected character"}'s pieces first, then crafts, then purchases at the prices you set.
  Best case: every craft succeeds (a COMBO in game is a bonus on top). A material with no recipe and no price is one to farm (Bound ones).</p></Intro>
{#if !c.game}{@render loader()}{/if}
<div class="mb-3 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
  <Kpi label="To buy" value={num(bill.buyKina)} sub={bill.unpriced.length ? `${bill.unpriced.length} without a price` : "Kina at market prices"} />
  <Kpi label="Craft fees" value={num(bill.feeKina)} sub="Kina" />
  <Kpi label="Total" value={num(bill.total)} cls="hero"
    sub={kina == null ? "Kina" : kina >= bill.total ? `${num(kina)} Kina in the wallet` : `${num(bill.total - kina)} Kina short`} />
</div>

<div class="mb-3 flex flex-wrap items-center gap-2">
  <Button variant="outline" size="sm" disabled={!inv?.items} onclick={fill}>Fill owned from game</Button>
  <span class="text-xs text-muted-foreground">{inv?.items && inv.itemsAt ? `${char}'s bag${inv.stored ? " and warehouse" : ""}, read ${new Date(inv.itemsAt).toLocaleString()}. Replaces the owned count of every game item.`
    : "Desktop app: enter the world with the game's recipes loaded, and the meter reads your bag and warehouse."}</span></div>

<Panel title="Targets">
  <Table.Root>
    <Table.Body>{#each c.targets as t (t.item)}<Table.Row>
      <Table.Cell>{@render pic(c.items[t.item])}<b>{c.items[t.item].name}</b></Table.Cell>
      <Table.Cell class="text-right"><Input class="ml-auto h-7 w-20" type="number" min="0" value={t.qty} aria-label="How many {c.items[t.item].name}"
        onchange={(e) => commit(e, (v) => setTarget(ui.data, t.item, v), () => c.targets.find((x) => x.item === t.item)?.qty ?? 0)} /></Table.Cell>
      <Table.Cell class="w-10 text-right"><Button variant="ghost" size="icon-sm" aria-label="Take {c.items[t.item].name} out" title="Take it out" onclick={() => act(() => setTarget(ui.data, t.item, "0"))}><ICON.close /></Button></Table.Cell>
    </Table.Row>{:else}<Table.Row><Table.Cell class="text-muted-foreground">No target yet: add what you want to craft.</Table.Cell></Table.Row>{/each}</Table.Body>
  </Table.Root>
  {@render filters()}
  <form class="mt-2.5 flex flex-wrap gap-2" onsubmit={(e) => { const v = fields(e); pick = ""; act(() => { const id = addItem(ui.data, v.name); if (!id) return false; setTarget(ui.data, id, v.qty); }); }}>
    <div class="relative flex max-w-96 flex-[1_1_260px] items-center">{#if chosen}{@render pic(chosen)}{/if}
      <Input class="min-w-0 flex-1" name="name" bind:value={pick} placeholder="Item to craft" aria-label="Item to craft" autocomplete="off" required
        role="combobox" aria-expanded={open && !!picks.length} aria-controls="craft-pick-list" aria-autocomplete="list"
        onfocus={() => { open = true; }} onblur={() => { open = false; }} oninput={() => { open = true; }}
        onkeydown={(e) => { if (e.key === "Escape") open = false; }} />
      {#if open && picks.length}<div id="craft-pick-list" class="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg" role="listbox" aria-label="Items">
        {#each picks as [g, list] (g)}<div class="px-1.5 pt-1.5 pb-0.5 text-xs tracking-wide text-muted-foreground uppercase" role="presentation">{g}</div>
          {#each list as it (it.id)}<button type="button" data-slot="option" class="flex w-full items-center rounded-sm px-1.5 py-1 text-left hover:bg-accent focus-visible:bg-accent" role="option" aria-selected={chosen?.id === it.id} onmousedown={(e) => e.preventDefault()}
            onclick={() => { pick = it.name; open = false; }}>{@render pic(it)}<span class="flex-1">{it.name}</span>{#if it.prof}<small class="ml-2 text-xs text-muted-foreground">{it.prof}</small>{/if}</button>{/each}
        {/each}{#if pickMore}<div class="px-1.5 pt-1.5 text-xs text-muted-foreground" role="presentation">{num(pickMore)} more: type to narrow</div>{/if}</div>{/if}
    </div>
    <Input class="w-20" name="qty" type="number" min="1" value="1" aria-label="How many" /><Button type="submit">Add target</Button></form>
</Panel>

{#if nodes.length}<Panel title="Recipe tree">
  <p class="hint mt-0 mb-2">Every input right under the craft that takes it. Your pieces count where they are met first; a craft they cover has nothing under it.</p>
  <Table.Root>
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Item</Table.Head><Table.Head class="text-right">Need</Table.Head><Table.Head class="text-right">Owned</Table.Head><Table.Head class="text-right">Crafts</Table.Head><Table.Head class="text-right">To get</Table.Head></Table.Row></Table.Header>
    <Table.Body>{#each nodes as n, i (i)}{@const it = c.items[n.item]}<Table.Row class="{n.depth ? '' : 'border-t font-semibold'} {n.used === n.need ? 'text-hps' : ''}">
      <Table.Cell style="padding-left: calc(8px + {n.depth} * 20px)">{@render pic(it)}<span>{it.name}</span>{#if it.recipe && it.buy}{@render extra(" bought")}{/if}</Table.Cell>
      <Table.Cell class="text-right">{num(n.need)}</Table.Cell>
      <Table.Cell class="text-right">{n.used ? num(n.used) : ""}</Table.Cell>
      <Table.Cell class="text-right">{n.craft ? `${num(n.craft)}×` : ""}</Table.Cell>
      <Table.Cell class="text-right">{n.buy ? num(n.buy) : ""}{#if n.buy && it.price == null} {@render extra(it.recipe ? "no price" : "farm")}{/if}</Table.Cell>
    </Table.Row>{/each}</Table.Body>
  </Table.Root></Panel>{/if}

{#if crafts.length}<Panel title="Crafts" count={num(crafts.reduce((s, l) => s + l.craft, 0))}>
  <Table.Root>
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Item</Table.Head><Table.Head class="text-right">Need</Table.Head><Table.Head class="text-right">Owned</Table.Head><Table.Head class="text-right">Crafts</Table.Head></Table.Row></Table.Header>
    <Table.Body>{#each crafts as l (l.item)}{@const it = c.items[l.item]}{@const t = advice(it)}<Table.Row class={l.used === l.need ? "[&_.item-name]:text-hps" : ""}>
      <Table.Cell class="whitespace-normal">{@render pic(it)}<span class="item-name font-medium">{it.name}</span> {@render craftOrBuy(it)}{#if t}{@render tip(t)}{/if}</Table.Cell>
      <Table.Cell class="text-right">{num(l.need)}</Table.Cell>
      <Table.Cell class="text-right">{@render have(l.item)}</Table.Cell>
      <Table.Cell class="text-right">{l.craft ? `${num(l.craft)}×` : ""}</Table.Cell>
    </Table.Row>{/each}</Table.Body>
  </Table.Root></Panel>{/if}

{#if raws.length}<Panel title="Materials to get" count={raws.length}>
  <Table.Root>
    <Table.Header><Table.Row class="hover:bg-transparent"><Table.Head>Material</Table.Head><Table.Head class="text-right">Need</Table.Head><Table.Head class="text-right">Owned</Table.Head><Table.Head class="text-right">To get</Table.Head><Table.Head class="text-right">Price</Table.Head><Table.Head class="text-right">Kina</Table.Head></Table.Row></Table.Header>
    <Table.Body>{#each raws as l (l.item)}{@const it = c.items[l.item]}{@const t = advice(it)}<Table.Row class={l.used === l.need ? "[&_.item-name]:text-hps" : ""}>
      <Table.Cell class="whitespace-normal">{@render pic(it)}<span class="item-name font-medium">{it.name}</span>{#if it.recipe} {@render craftOrBuy(it)}{/if}{#if t}{@render tip(t)}{/if}</Table.Cell>
      <Table.Cell class="text-right">{num(l.need)}</Table.Cell>
      <Table.Cell class="text-right">{@render have(l.item)}</Table.Cell>
      <Table.Cell class="text-right">{l.buy ? num(l.buy) : ""}{#if l.buy && it.price == null} {@render extra(it.recipe ? "no price" : "farm")}{/if}</Table.Cell>
      <Table.Cell class="text-right"><Input class="ml-auto h-7 w-26" type="number" min="0" value={it.price ?? ""} placeholder="—" title={day(it.priceAt)} aria-label="Market price of {it.name}"
        onchange={(e) => commit(e, (v) => setPrice(ui.data, it.id, v, Date.now()), () => c.items[it.id].price ?? "")} /></Table.Cell>
      <Table.Cell class="text-right">{l.cost ? num(l.cost) : ""}</Table.Cell>
    </Table.Row>{/each}</Table.Body>
  </Table.Root></Panel>{/if}

{:else}
<Intro><p>Every item, raw or crafted: a recipe is what one craft takes. An input typed that doesn't exist yet is added as a new item.
  The item code is the game's (aion2hub shows it in the item's link): "Fill owned from game" matches your inventory by it.</p></Intro>
{@render loader()}
<Panel title="Items" count={items.length}>
  {@render filters()}
  <Input class="mt-2.5 max-w-80" type="search" placeholder="Search an item" aria-label="Search an item" autocomplete="off" bind:value={query} />
  <form class="mt-2.5 flex flex-wrap gap-2" onsubmit={(e) => { const v = fields(e); act(() => addItem(ui.data, v.name) ? undefined : false); }}>
    <Input class="max-w-80 flex-[1_1_220px]" name="name" placeholder="New item" aria-label="New item" autocomplete="off" required /><Button type="submit" variant="outline">Add item</Button></form>
  {#each found.slice(0, SHOWN) as it (it.id)}<details class="border-b py-2"><summary class="cursor-pointer">{@render pic(it)}<b>{it.name}</b>
    {@render extra(`${it.recipe ? `${it.recipe.inputs.length} input${it.recipe.inputs.length === 1 ? "" : "s"}` : "material"}${it.price != null ? ` · ${num(it.price)} Kina` : ""}`)}</summary>
    <div class="my-2.5 flex flex-wrap items-end gap-2.5 [&_label]:flex [&_label]:flex-col [&_label]:gap-1 [&_label]:text-xs [&_label]:text-muted-foreground">
      <label>Name <Input value={it.name} autocomplete="off" onchange={(e) => commit(e, (v) => renameItem(ui.data, it.id, v), () => c.items[it.id].name)} /></label>
      <label>Item code <Input value={it.code ?? ""} inputmode="numeric" placeholder="e.g. 600590001" autocomplete="off" onchange={(e) => commit(e, (v) => setCode(ui.data, it.id, v), () => c.items[it.id].code ?? "")} /></label>
      <label>Market price <Input class="w-28" type="number" min="0" value={it.price ?? ""} placeholder="—" title={day(it.priceAt)} onchange={(e) => commit(e, (v) => setPrice(ui.data, it.id, v, Date.now()), () => c.items[it.id].price ?? "")} /></label>
      {#if it.recipe}<label>Pieces per craft <Input class="w-28" type="number" min="1" value={it.recipe.yields} onchange={(e) => commit(e, (v) => setYields(ui.data, it.id, v), () => c.items[it.id].recipe?.yields)} /></label>
      <label>Kina per craft <Input class="w-28" type="number" min="0" value={it.recipe.kina} onchange={(e) => commit(e, (v) => setFee(ui.data, it.id, v), () => c.items[it.id].recipe?.kina)} /></label>{/if}
      <Button variant="ghost" size="sm" class="text-destructive" onclick={() => attempt(() => removeItem(ui.data, it.id))}>Delete item</Button>
    </div>
    {#if it.recipe}<Table.Root><Table.Body>{#each it.recipe.inputs as i (i.item)}<Table.Row>
      <Table.Cell class="w-24"><Input class="h-7 w-20" type="number" min="0" value={i.qty} aria-label="{c.items[i.item].name} per craft"
        onchange={(e) => commit(e, (v) => setInputQty(ui.data, it.id, i.item, v), () => c.items[it.id].recipe?.inputs.find((x) => x.item === i.item)?.qty ?? 0)} /></Table.Cell>
      <Table.Cell>{@render pic(c.items[i.item])}{c.items[i.item].name}</Table.Cell></Table.Row>{/each}</Table.Body></Table.Root>{/if}
    <form class="mt-2.5 flex flex-wrap gap-2" onsubmit={(e) => { const v = fields(e); attempt(() => { const id = addItem(ui.data, v.name); if (!id) return false; addInput(ui.data, it.id, id, Math.max(1, Math.floor(Number(v.qty)) || 1)); }); }}>
      <Input class="w-20" name="qty" type="number" min="1" value="1" aria-label="How many per craft" />
      <Input class="max-w-80 flex-[1_1_220px]" name="name" list="craft-items" placeholder="Input (item or new name)" aria-label="Input" autocomplete="off" required /><Button type="submit" variant="outline">Add input</Button></form>
  </details>{/each}
  {#if found.length > SHOWN}<p class="hint">{num(found.length - SHOWN)} more: search to narrow the list.</p>{/if}
</Panel>

<Panel title="Share recipes">
  <p class="hint mt-0">Copy your items and recipes (no prices, no stock) for a friend, or paste theirs: the same item gets their recipe, prices and stock stay yours.</p>
  <div class="mt-2.5"><Button variant="outline" size="sm" onclick={() => { navigator.clipboard.writeText(exportRecipes(ui.data)).then(() => showStatus("Recipes copied"), () => showStatus("Copy failed", true)); }}>Copy my recipes</Button></div>
  <Textarea class="mt-2.5 text-xs" bind:value={shared} rows={3} placeholder="Paste shared recipes here" aria-label="Shared recipes" />
  <div class="mt-2.5"><Button size="sm" disabled={!shared.trim()} onclick={() => attempt(() => { const n = importRecipes(ui.data, shared); shared = ""; showStatus(`${n} item${n === 1 ? "" : "s"} imported`); })}>Import</Button></div>
</Panel>
{/if}
