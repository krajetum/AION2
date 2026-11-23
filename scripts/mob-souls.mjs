// Writes src/domain/mob-souls.ts (which pet's soul each monster drops) from the souls.json that scripts/souls.ps1
// downloads from aion2hub.com's item pages (Global client data). Run after a game patch:
//   powershell -ExecutionPolicy Bypass -File scripts/souls.ps1   (writes souls.json where it runs)
//   node scripts/mob-souls.mjs path/to/souls.json
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
if (!file) throw new Error("usage: node scripts/mob-souls.mjs souls.json");
const souls = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
const bySoul = {}, items = {};
for (const s of souls) {
  const name = /^Soul: (.*?) \(Bound\)/.exec(s.name)?.[1];
  if (!name) continue;
  items[name] = s.id;
  for (const [mob] of s.mobs ?? []) (bySoul[mob] ??= new Set()).add(name);
}
const mobs = Object.keys(bySoul).sort((a, b) => a.localeCompare(b));
const rows = mobs.map((m) => `  ${JSON.stringify(m.toLowerCase())}: ${JSON.stringify([...bySoul[m]].sort())},`);
const ts = `// Which pet's soul each monster drops: monster name (lower case) → the soul(s) its kills drop, by the souls' names
// ("Soul: Papis (Bound)" → "Papis", the pet's name in pet-names.ts). From aion2hub.com's item pages ("Dropped by"),
// Global client data, downloaded ${new Date().toISOString().slice(0, 10)} by scripts/souls.ps1 and written by scripts/mob-souls.mjs:
// ${Object.keys(items).length} souls, ${mobs.length} monsters. The names are the game's (NCSOFT). Pure data.
export const MOB_SOULS: Record<string, string[]> = {
${rows.join("\n")}
};

/** Each soul's item code ("Soul: X (Bound)", in every kill's loot), by the soul's name. */
export const SOUL_ITEMS: Record<string, number> = ${JSON.stringify(items)};
`;
writeFileSync(new URL("../src/domain/mob-souls.ts", import.meta.url), ts);
console.log(`${Object.keys(items).length} souls, ${mobs.length} monsters`);
