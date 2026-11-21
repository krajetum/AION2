// Stats from gear: every equipped piece's lines from the official profile (main stats with their enchant, random
// bonus lines, manastones) added up by stat, with what each piece gives. Before the game's percentages (Might's Attack
// increase and the like): checked on 2026-11-21 against the player's Stat Info with 18 pieces taken off one at a time,
// each piece's Attack, Accuracy, Critical Hit… times (1 + the game's %) = what the total lost, within 1 point. Pure.
import type { ItemDetail, Piece } from "./armory.ts";

export interface GearStat {
  key: string; name: string; pct: boolean; value: number;
  by: { slot: number; piece: string; value: number }[]; // the pieces that give it
}

// The site's ids that are one stat in the game's Stat Info: a weapon's Accuracy and a bonus line's "Accuracy Bonus".
const SAME: Record<string, string> = { WeaponAccuracy: "Accuracy", ArmorEvasion: "Evasion" };
const NAMES: Record<string, string> = { WeaponFixingDamage: "Attack", ArmorDefense: "Defense", Accuracy: "Accuracy", Evasion: "Evasion" };
// Stat Info's order first.
const ORDER = ["WeaponFixingDamage", "ArmorDefense", "Accuracy", "Evasion", "Critical", "CriticalResist", "HPMax", "MPMax", "CombatSpeed", "MoveSpeed"];

/** "12.3%", "+7", "1,234" → 12.3 / 7 / 1234; "" → 0. */
const amount = (s: string) => { const m = /[+-]?\d+(?:\.\d+)?/.exec(s.replace(/,/g, "")); return m ? Number(m[0]) : 0; };

/** Every piece's lines added up by stat (pieces whose details weren't read are left out). */
export function gearStats(pieces: { piece: Piece; detail: ItemDetail | null | undefined }[]): GearStat[] {
  const out = new Map<string, GearStat>();
  const add = (p: Piece, id: string, name: string, raw: string, value: number) => {
    if (!value) return;
    const pct = raw.includes("%"), base = SAME[id] ?? id, key = `${base}${pct ? "%" : ""}`;
    const s = out.get(key) ?? { key, name: NAMES[base] ?? name, pct, value: 0, by: [] };
    s.value = Math.round((s.value + value) * 100) / 100;
    const mine = s.by.find((b) => b.slot === p.slot);
    if (mine) mine.value = Math.round((mine.value + value) * 100) / 100;
    else s.by.push({ slot: p.slot, piece: p.name, value });
    out.set(key, s);
  };
  for (const { piece: p, detail: d } of pieces) {
    if (!d) continue;
    for (const m of d.main) add(p, m.id, m.name, m.value + m.extra, amount(m.value) + amount(m.extra));
    for (const s of d.sub) add(p, s.id, s.name, s.value, amount(s.value));
    for (const s of d.manastones) add(p, s.id, s.name, s.value, amount(s.value));
  }
  const rank = (k: string) => { const i = ORDER.indexOf(k.replace(/%$/, "")); return i < 0 ? ORDER.length : i; };
  return [...out.values()].map((s, i) => ({ s, i })).sort((a, b) => rank(a.s.key) - rank(b.s.key) || a.i - b.i).map((x) => x.s);
}

/** A total as the game writes it: "2,362", "34.4%". */
export const gearText = (s: { value: number; pct: boolean }) =>
  s.pct ? `${Math.round(s.value * 10) / 10}%` : Math.round(s.value).toLocaleString("en-US");
