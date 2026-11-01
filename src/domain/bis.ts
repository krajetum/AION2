// Best in slot: the ideal bonus lines of each piece for each class (src/assets/bis.json, transcribed by hand from the
// screenshots of kisk.app's best-in-slot cards the player sent on 2026-11-01), what a piece has of them, and the player's own
// lists (`AppData.bis`, edited on the Players page), which replace the bundled ones. Pure.
// The site's % per line is kept as it showed it (its weight for that line); its score is not reproduced.
import type { ItemDetail } from "./armory.ts";

/** One ideal line: a stat with its best roll ("13.0%", "32") or a skill with its level ("+4"). */
export interface BisLine { stat: string; value: string; pct?: number }
/** Class → slot → lines. Slots: Weapon, Off-hand, Torso, Pants, Helmet, Shoulders, Gloves, Boots, Cape, Necklace,
 *  Earring, Ring, Bracelet, Arcana1..5 (Chalice, Parchment, Compass, Bell, Mirror). */
export type BisTable = Record<string, Record<string, BisLine[]>>;

/** The game's slot names (equipment `slotPosName`) → the BiS slot. Belt, amulet and runes have none. */
const SLOTS: Record<string, string> = {
  MainHand: "Weapon", SubHand: "Off-hand", Torso: "Torso", Pants: "Pants", Helmet: "Helmet", Shoulder: "Shoulders",
  Gloves: "Gloves", Boots: "Boots", Cape: "Cape", Necklace: "Necklace", Earring1: "Earring", Earring2: "Earring",
  Ring1: "Ring", Ring2: "Ring", Bracelet1: "Bracelet", Bracelet2: "Bracelet",
  Arcana1: "Arcana1", Arcana2: "Arcana2", Arcana3: "Arcana3", Arcana4: "Arcana4", Arcana5: "Arcana5",
};
export const bisSlot = (slotName: string): string | null => SLOTS[slotName] ?? null;

/** An arcana's kind by its slot: the game always puts them in this order, and its data does not name the kind. */
export const ARCANA_KINDS: Record<string, string> = { Arcana1: "Chalice", Arcana2: "Parchment", Arcana3: "Compass", Arcana4: "Bell", Arcana5: "Mirror" };

/** A slot as the card says it. */
export const slotLabel = (slot: string) => (slot.startsWith("Arcana") ? `${ARCANA_KINDS[slot] ?? "Arcana"} arcana` : slot);

/** The lines for a class and slot: the player's list if they made one, else the bundled one. */
export function bisLines(bundled: BisTable, mine: BisTable, className: string, slot: string): BisLine[] | null {
  return mine[className]?.[slot] ?? bundled[className]?.[slot] ?? null;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** A piece's own lines (bonus stats, and an arcana's skills) by name, with their values. */
function ownLines(d: ItemDetail): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of d.sub) m.set(norm(s.name), s.value);
  for (const s of d.skills) m.set(norm(s.name), s.level != null ? `+${s.level}` : "");
  return m;
}

export interface BisCheck { line: BisLine; yours: string | null } // `yours` = the piece's value of that line, null if it has none

/** Which ideal lines the piece has (by name: the roll may be lower), and how many. */
export function checkBis(lines: BisLine[], d: ItemDetail | null): { lines: BisCheck[]; has: number } {
  const own = d ? ownLines(d) : new Map<string, string>();
  const out = lines.map((line) => ({ line, yours: own.get(norm(line.stat)) ?? null }));
  return { lines: out, has: out.filter((c) => c.yours != null).length };
}

/** The piece's lines that are among the ideal ones (for the card's front). */
export function idealNames(lines: BisLine[] | null): Set<string> {
  return new Set((lines ?? []).map((l) => norm(l.stat)));
}
export const isIdeal = (names: Set<string>, stat: string) => names.has(norm(stat));

/** The player's lists from a save file: only well-formed lines kept. */
export function cleanBis(raw: any): BisTable {
  const out: BisTable = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [cls, slots] of Object.entries<any>(raw)) {
    if (!slots || typeof slots !== "object") continue;
    for (const [slot, lines] of Object.entries<any>(slots)) {
      if (!Array.isArray(lines)) continue;
      const ok = lines.filter((l) => l && typeof l.stat === "string" && l.stat.trim() && typeof l.value === "string")
        .map((l): BisLine => ({ stat: l.stat.trim(), value: l.value.trim(), ...(typeof l.pct === "number" && { pct: l.pct }) }));
      (out[cls] ??= {})[slot] = ok;
    }
  }
  return out;
}
