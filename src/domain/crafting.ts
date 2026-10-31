// Crafting bill of materials: recipes (nested: a material can be crafted from others), what each character owns and
// market prices → what to craft, what to buy and the Kina it costs. Best case: every craft succeeds (no failure, no
// COMBO). Item codes are the game's (aion2hub's item ids are the same numbers), kept for reading the inventory later. Pure.

export interface Input { item: string; qty: number }
export interface Recipe { inputs: Input[]; yields: number; kina: number } // yields: pieces per craft; kina: fee per craft
export interface CraftItem {
  id: string;
  name: string;
  code?: number;    // the game's item code
  price?: number;   // market price per piece (Kina), set by the player
  priceAt?: number; // when the price was set
  recipe?: Recipe;
  buy?: boolean;    // bought even though it has a recipe
}
export interface CraftData {
  items: Record<string, CraftItem>;
  targets: Input[];                               // what to craft, and how many
  owned: Record<string, Record<string, number>>;  // character name → item id → pieces owned
  game?: { side: Side; builtAt: string };         // the game recipes loaded last
}

export type Side = "Elyos" | "Asmodian";
/** The game's recipes bundled with the app (src/assets/recipes.json, built by scripts/recipes.mjs from aion2hub's
 *  Global client data): item names by code, and per faction product code → [pieces per craft, [input code, qty][]]. */
export interface GameRecipes { builtAt: string; items: Record<string, string>; recipes: Record<Side, Record<string, [number, [number, number][]]>> }

/** One material of the bill: its total need, what stock covers, and how the rest is got. */
export interface Line { item: string; level: number; need: number; used: number; craft: number; buy: number; cost: number; fee: number }
export interface Bill { lines: Line[]; buyKina: number; feeKina: number; total: number; unpriced: string[] }

export const emptyCrafting = (): CraftData => ({ items: {}, targets: [], owned: {} });

/** Crafted here: it has a recipe and the player didn't choose to buy it. */
export const crafted = (it: CraftItem | undefined): it is CraftItem & { recipe: Recipe } => !!it?.recipe?.inputs.length && !it.buy;

/** True if `input` is `item` or needs it somewhere down its recipes: adding it to `item`'s recipe would loop. */
export function wouldCycle(data: CraftData, item: string, input: string): boolean {
  const seen = new Set<string>();
  const walk = (id: string): boolean =>
    id === item || (!seen.has(id) && (seen.add(id), (data.items[id]?.recipe?.inputs ?? []).some((i) => walk(i.item))));
  return walk(input);
}

/** The bill for the targets, stock taken first. Materials are settled by level (deepest use of each), so the need of a
 *  material used by several recipes is summed before its crafts are counted: one rounding up to the yield, not one per use. */
export function explode(data: CraftData, owned: Record<string, number> = {}): Bill {
  const level = new Map<string, number>();
  const visit = (id: string, d: number, path: Set<string>) => {
    if (path.has(id) || (level.get(id) ?? -1) >= d) return; // a loop (wouldCycle keeps them out), or already as deep
    level.set(id, d);
    const it = data.items[id];
    if (crafted(it)) for (const i of it.recipe.inputs) visit(i.item, d + 1, new Set(path).add(id));
  };
  for (const t of data.targets) visit(t.item, 0, new Set());

  const need = new Map<string, number>();
  const add = (id: string, n: number) => need.set(id, (need.get(id) ?? 0) + n);
  for (const t of data.targets) add(t.item, t.qty);
  const lines: Line[] = [];
  for (const [id, lvl] of [...level].sort((a, b) => a[1] - b[1])) {
    const n = need.get(id) ?? 0;
    if (n <= 0) continue;
    const it = data.items[id];
    const used = Math.min(n, Math.max(0, owned[id] ?? 0)), rest = n - used;
    const line: Line = { item: id, level: lvl, need: n, used, craft: 0, buy: 0, cost: 0, fee: 0 };
    if (crafted(it)) {
      line.craft = Math.ceil(rest / it.recipe.yields);
      line.fee = line.craft * it.recipe.kina;
      for (const i of it.recipe.inputs) add(i.item, line.craft * i.qty);
    } else {
      line.buy = rest;
      line.cost = rest * (it?.price ?? 0);
    }
    lines.push(line);
  }
  const buyKina = lines.reduce((s, l) => s + l.cost, 0), feeKina = lines.reduce((s, l) => s + l.fee, 0);
  const unpriced = lines.filter((l) => l.buy > 0 && data.items[l.item]?.price == null).map((l) => l.item);
  return { lines, buyKina, feeKina, total: buyKina + feeKina, unpriced };
}

/** Kina for one piece crafted (its fee and inputs at market price, crafted inputs by their own recipe; no stock),
 *  or undefined when an input has no price. Compared with its price: buy or craft. */
export function craftCost(data: CraftData, id: string, path = new Set<string>()): number | undefined {
  const r = data.items[id]?.recipe;
  if (!r?.inputs.length || path.has(id)) return undefined;
  let sum = r.kina;
  for (const i of r.inputs) {
    const it = data.items[i.item];
    const u = crafted(it) ? craftCost(data, i.item, new Set(path).add(id)) : it?.price;
    if (u == null) return undefined;
    sum += u * i.qty;
  }
  return sum / r.yields;
}

/** Merges a faction's game recipes, each item under its game code (its id): name and recipe from the game replace the
 *  kept ones, prices, craft/buy choices and stock stay. Two items of one name get their code after it. Returns the recipes read. */
export function takeGameRecipes(data: CraftData, g: GameRecipes, side: Side): number {
  const rs = g.recipes[side], codes = new Set<string>();
  for (const [p, [, inputs]] of Object.entries(rs)) { codes.add(p); for (const [i] of inputs) codes.add(String(i)); }
  const named = new Map<string, number>();
  for (const c of codes) named.set(g.items[c], (named.get(g.items[c]) ?? 0) + 1);
  for (const c of codes) {
    const name = named.get(g.items[c])! > 1 ? `${g.items[c]} #${c}` : g.items[c];
    const it = (data.items[c] ??= { id: c, name });
    it.name = name;
    it.code = Number(c);
    const r = rs[c];
    if (r) it.recipe = { inputs: r[1].map(([i, qty]) => ({ item: String(i), qty })), yields: r[0], kina: it.recipe?.kina ?? 0 };
  }
  data.game = { side, builtAt: g.builtAt };
  return Object.keys(rs).length;
}

const count = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

export function cleanCrafting(raw: any): CraftData {
  const out = emptyCrafting();
  if (!raw || typeof raw !== "object") return out;
  for (const [id, it] of Object.entries<any>(raw.items ?? {})) {
    if (!it || typeof it.name !== "string" || !it.name.trim()) continue;
    const r = it.recipe;
    const inputs: Input[] = Array.isArray(r?.inputs) ? r.inputs.filter((i: any) => typeof i?.item === "string" && count(i.qty) && i.qty > 0) : [];
    out.items[id] = {
      id, name: it.name.trim(),
      ...(Number.isInteger(it.code) && { code: it.code }),
      ...(count(it.price) && { price: it.price, ...(count(it.priceAt) && { priceAt: it.priceAt }) }),
      ...(inputs.length && { recipe: { inputs, yields: count(r.yields) && r.yields >= 1 ? r.yields : 1, kina: count(r.kina) ? r.kina : 0 } }),
      ...(it.buy === true && { buy: true }),
    };
  }
  // Inputs and targets of items that are gone are dropped.
  for (const it of Object.values(out.items)) if (it.recipe) {
    it.recipe.inputs = it.recipe.inputs.filter((i) => out.items[i.item]);
    if (!it.recipe.inputs.length) delete it.recipe;
  }
  out.targets = Array.isArray(raw.targets) ? raw.targets.filter((t: any) => out.items[t?.item] && count(t.qty) && t.qty > 0) : [];
  for (const [name, o] of Object.entries<any>(raw.owned ?? {}))
    if (name.trim() && o && typeof o === "object") out.owned[name] = Object.fromEntries(Object.entries(o).filter(([, v]) => count(v))) as Record<string, number>;
  if ((raw.game?.side === "Elyos" || raw.game?.side === "Asmodian") && typeof raw.game.builtAt === "string") out.game = { side: raw.game.side, builtAt: raw.game.builtAt };
  return out;
}
