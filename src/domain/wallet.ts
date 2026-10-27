// Your currencies per character (src-tauri/meter/src/currencies.rs: inventory items read from the game's
// traffic) and Odyle energy, kept so the sidebar shows them while the game is closed. Pure.

/** The currencies, by the item code the game sends (checked against the amounts in game, 2026-10-27). */
export const CURRENCIES: { code: number; name: string }[] = [
  { code: 930_100_031, name: "Kina" },
  { code: 930_100_001, name: "Bound Kina" }, // spent first at a shop: to 0 in the same record as the Kina
  { code: 930_100_003, name: "Abyss Points" },
  { code: 930_100_017, name: "Nightmare Coins" },
  { code: 930_100_011, name: "Shugo Coins" },
];

/** What the meter sends: the currencies seen, on the character they are of. */
export interface MeterWallet { owner: string | null; values: Record<string, number>; atMs: number }
export interface Wallet {
  values: Record<string, number>; // item code → amount
  atMs: number;                   // when the game last sent one of them
  odyle?: { basic: number; charged: number; atMs: number };
}

const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function cleanWallets(raw: any): Record<string, Wallet> {
  const out: Record<string, Wallet> = {};
  if (raw && typeof raw === "object") for (const [name, w] of Object.entries<any>(raw)) {
    if (!name.trim() || !w || !ok(w.atMs)) continue;
    const values = Object.fromEntries(Object.entries(w.values ?? {}).filter(([, v]) => ok(v))) as Record<string, number>;
    const o = w.odyle;
    out[name] = { values, atMs: w.atMs, ...(o && ok(o.basic) && ok(o.charged) && ok(o.atMs) && { odyle: { basic: o.basic, charged: o.charged, atMs: o.atMs } }) };
  }
  return out;
}

/** The meter's currencies into the character's wallet (the amounts it sent replace the kept ones). Returns true if anything changed. */
export function takeWallet(all: Record<string, Wallet>, w: MeterWallet | null | undefined): boolean {
  const name = w?.owner?.trim();
  if (!w || !name) return false;
  const kept = (all[name] ??= { values: {}, atMs: 0 });
  if (w.atMs < kept.atMs) return false;
  let changed = false;
  for (const [code, v] of Object.entries(w.values)) if (ok(v) && kept.values[code] !== v) { kept.values[code] = v; changed = true; }
  if (changed) kept.atMs = w.atMs;
  return changed;
}

/** The Odyle energy the game sent, on its owner's wallet. Returns true if it changed. */
export function takeOdyle(all: Record<string, Wallet>, o: { basic: number; charged: number; owner: string | null } | null | undefined, now: number): boolean {
  const name = o?.owner?.trim();
  if (!o || !name) return false;
  const kept = (all[name] ??= { values: {}, atMs: 0 });
  if (kept.odyle && kept.odyle.basic === o.basic && kept.odyle.charged === o.charged) return false;
  kept.odyle = { basic: o.basic, charged: o.charged, atMs: now };
  return true;
}

/** The Wallet's rows: each currency the game sent, or with `sumKina` Kina and bound Kina as one "Kina" total. */
export function walletRows(w: Wallet, sumKina: boolean): { name: string; value: number }[] {
  const rows = CURRENCIES.filter((c) => w.values[c.code] != null).map((c) => ({ code: c.code, name: c.name, value: w.values[c.code] }));
  if (!sumKina) return rows.map(({ name, value }) => ({ name, value }));
  const kina = rows.filter((r) => r.code === 930_100_031 || r.code === 930_100_001);
  const out = rows.filter((r) => !kina.includes(r)).map(({ name, value }) => ({ name, value }));
  if (kina.length) out.unshift({ name: "Kina (all)", value: kina.reduce((n, r) => n + r.value, 0) });
  return out;
}

/** A character's wallet, by name as the game writes it (any case). */
export const walletOf = (all: Record<string, Wallet>, name: string | undefined) =>
  name ? Object.entries(all).find(([n]) => n.trim().toLowerCase() === name.trim().toLowerCase())?.[1] : undefined;

/**
 * The wallet the sidebar shows: the selected character's (by its name in the app), else the one of the character
 * played in game (the app's character may be named otherwise, "Main"), else the only one kept.
 */
export function pickWallet(all: Record<string, Wallet>, selected: string | undefined, playing: string | undefined):
  { name: string; wallet: Wallet } | undefined {
  for (const n of [selected, playing]) {
    const name = n && Object.keys(all).find((k) => k.trim().toLowerCase() === n.trim().toLowerCase());
    if (name) return { name, wallet: all[name] };
  }
  const names = Object.keys(all);
  return names.length === 1 ? { name: names[0], wallet: all[names[0]] } : undefined;
}
