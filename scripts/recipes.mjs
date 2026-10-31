// Builds src/assets/recipes.json (the Crafting page's game recipes) from aion2hub.com's crafting calculator, whose
// data is extracted from the Global game client. Run after a game patch: node scripts/recipes.mjs
// The calculator's script holds the data as a JSON.parse('…') string: decoded here, never run.
import { writeFileSync } from "node:fs";

const SITE = "https://aion2hub.com";
const get = async (path) => { const r = await fetch(SITE + path); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.text(); };

const page = await get("/tools/crafting-calculator");
let data;
for (const chunk of new Set(page.match(/\/_next\/static\/chunks\/[\w.-]+\.js/g))) {
  const src = await get(chunk), at = src.indexOf('"recipes":[');
  if (at < 0) continue;
  let i = src.lastIndexOf("JSON.parse('", at) + 12, s = "";
  for (; src[i] !== "'"; i++) {
    if (src[i] !== "\\") { s += src[i]; continue; }
    const e = src[++i];
    if (e === "u") { s += String.fromCharCode(parseInt(src.slice(i + 1, i + 5), 16)); i += 4; }
    else if (e === "x") { s += String.fromCharCode(parseInt(src.slice(i + 1, i + 3), 16)); i += 2; }
    else s += { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" }[e] ?? e;
  }
  data = JSON.parse(s);
  break;
}
if (!data) throw new Error("No recipe data found: the site changed.");

// One recipe per product and faction: the smallest batch (the others are the same recipe times 10).
const code = (key) => data.items[key].i;
const recipes = { Elyos: {}, Asmodian: {} };
for (const r of [...data.recipes].sort((a, b) => a.y - b.y)) {
  const side = recipes[r.race === "Light" ? "Elyos" : "Asmodian"], p = code(r.p);
  side[p] ??= [r.y, r.c.map((c) => [code(c.i), c.q])];
}
const items = Object.fromEntries(Object.values(data.items).map((it) => [it.i, it.n]));
writeFileSync(new URL("../src/assets/recipes.json", import.meta.url),
  JSON.stringify({ source: "aion2hub.com crafting calculator (Global client data)", builtAt: data.builtAt, items, recipes }) + "\n");
console.log(`${Object.keys(items).length} items, ${Object.keys(recipes.Elyos).length} Elyos and ${Object.keys(recipes.Asmodian).length} Asmodian recipes (${data.builtAt})`);
