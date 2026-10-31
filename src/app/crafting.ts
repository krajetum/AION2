// Crafting use cases (Crafting tab): items and their recipes, targets, pieces owned per character, market prices.
import { cleanCrafting, wouldCycle } from "../domain/crafting.ts";
import type { AppData } from "../domain/types.ts";

/** A whole number ≥ 0 from a field; empty or junk = 0. */
const count = (v: string) => Math.max(0, Math.floor(Number(v.trim()) || 0));

/** Adds an item, or returns the one already named so (case aside). */
export function addItem(data: AppData, name: string): string | undefined {
  const n = name.trim();
  if (!n) return undefined;
  const same = Object.values(data.crafting.items).find((it) => it.name.toLowerCase() === n.toLowerCase());
  if (same) return same.id;
  const id = crypto.randomUUID();
  data.crafting.items[id] = { id, name: n };
  return id;
}

export function renameItem(data: AppData, id: string, v: string) { if (v.trim()) data.crafting.items[id].name = v.trim(); }

export function setCode(data: AppData, id: string, v: string) {
  const it = data.crafting.items[id], n = Number(v.trim());
  if (v.trim() && Number.isInteger(n) && n > 0) it.code = n;
  else delete it.code;
}

/** Market price per piece; empty = no price. */
export function setPrice(data: AppData, id: string, v: string, now: number) {
  const it = data.crafting.items[id];
  if (!v.trim()) { delete it.price; delete it.priceAt; return; }
  it.price = count(v);
  it.priceAt = now;
}

/** Adds an input to the item's recipe (or more of one already in it). Throws if the input needs the item. */
export function addInput(data: AppData, id: string, input: string, qty: number) {
  if (wouldCycle(data.crafting, id, input)) throw new Error(`${data.crafting.items[input].name} is made from ${data.crafting.items[id].name}: it can't be in its recipe.`);
  const r = (data.crafting.items[id].recipe ??= { inputs: [], yields: 1, kina: 0 });
  const had = r.inputs.find((i) => i.item === input);
  if (had) had.qty += qty;
  else r.inputs.push({ item: input, qty });
}

/** An input's quantity; 0 takes it out (and the recipe with its last input). */
export function setInputQty(data: AppData, id: string, input: string, v: string) {
  const it = data.crafting.items[id], r = it.recipe;
  if (!r) return;
  const n = count(v);
  if (n) r.inputs.find((i) => i.item === input)!.qty = n;
  else r.inputs = r.inputs.filter((i) => i.item !== input);
  if (!r.inputs.length) { delete it.recipe; delete it.buy; }
}

export function setYields(data: AppData, id: string, v: string) { const r = data.crafting.items[id].recipe; if (r) r.yields = Math.max(1, count(v)); }
export function setFee(data: AppData, id: string, v: string) { const r = data.crafting.items[id].recipe; if (r) r.kina = count(v); }

export function setBuy(data: AppData, id: string, buy: boolean) {
  const it = data.crafting.items[id];
  if (buy) it.buy = true;
  else delete it.buy;
}

/** Pieces the character owns; 0 forgets it. */
export function setOwned(data: AppData, char: string, id: string, v: string) {
  const o = (data.crafting.owned[char] ??= {}), n = count(v);
  if (n) o[id] = n;
  else delete o[id];
}

/** How many to craft; 0 takes the target out. */
export function setTarget(data: AppData, id: string, v: string) {
  const c = data.crafting, n = count(v), t = c.targets.find((x) => x.item === id);
  if (!n) c.targets = c.targets.filter((x) => x.item !== id);
  else if (t) t.qty = n;
  else c.targets.push({ item: id, qty: n });
}

/** Deletes an item. Throws while a recipe or a target uses it. */
export function removeItem(data: AppData, id: string) {
  const c = data.crafting;
  const user = Object.values(c.items).find((it) => it.recipe?.inputs.some((i) => i.item === id));
  if (user) throw new Error(`${c.items[id].name} is in the recipe of ${user.name}.`);
  if (c.targets.some((t) => t.item === id)) throw new Error(`${c.items[id].name} is a target: take it out first.`);
  delete c.items[id];
  for (const o of Object.values(c.owned)) delete o[id];
}

/** The items and recipes as JSON to share (no prices, no stock). */
export const exportRecipes = (data: AppData) =>
  JSON.stringify(Object.values(data.crafting.items).map(({ id, name, code, recipe }) => ({ id, name, code, recipe })));

/** Merges shared items: new ones added, the same id gets the shared name, code and recipe; prices and stock stay.
 *  Returns how many were read. Throws on text that isn't a list of items. */
export function importRecipes(data: AppData, text: string): number {
  const list = JSON.parse(text);
  if (!Array.isArray(list)) throw new Error("Not a recipe list.");
  const c = data.crafting;
  const read = cleanCrafting({ items: { ...c.items, ...Object.fromEntries(list.map((it: any) => [it?.id, { ...c.items[it?.id], ...it, recipe: it?.recipe }])) } }).items;
  // A shared recipe that loops with the local ones: the local recipe stays.
  const loops = (id: string) => (read[id].recipe?.inputs ?? []).some((i) => wouldCycle({ ...c, items: read }, id, i.item));
  for (const id of Object.keys(read)) if (loops(id)) {
    if (c.items[id]?.recipe) read[id].recipe = c.items[id].recipe;
    else delete read[id].recipe;
  }
  c.items = read;
  return list.filter((it: any) => read[it?.id]).length;
}
