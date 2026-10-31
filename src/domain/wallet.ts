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
export interface MeterWallet {
  owner: string | null; values: Record<string, number>; atMs: number;
  apGains?: { amount: number; mapId: number | null; atMs: number }[]; // Abyss Points gained, on the map you were on
}
/** Where Abyss Points came from: a PvP kill or assist of yours, a mob you killed, or anything else (quests, rewards). */
export type ApSource = "players" | "mobs" | "other";
export interface ApGain { amount: number; atMs: number; abyss: boolean; from: ApSource }
export interface Wallet {
  values: Record<string, number>; // item code → amount
  atMs: number;                   // when the game last sent one of them
  odyle?: { basic: number; charged: number; atMs: number };
  apGains?: ApGain[];             // the last AP_KEEP_MS of Abyss Points gained (`takeApGains`)
}

/** The Abyss's map id (src/domain/arena.ts KNOWN_MAPS). */
const ABYSS_MAP = 20;
/** AP gains are kept this long (the sidebar shows today's). */
export const AP_KEEP_MS = 8 * 86_400_000;
/** A gain is classified once this old: the meter reads a PvP death 2.5 s late, so its kill comes after the gain. */
export const AP_SETTLE_MS = 6_000;
/** A gain this close to a PvP kill or assist of yours is from it; this close after a mob kill of yours, from the mob.
 *  A guess from timing: the game sends the points as a plain amount change, with no reason. */
export const AP_NEAR_MS = 5_000;

const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function cleanWallets(raw: any): Record<string, Wallet> {
  const out: Record<string, Wallet> = {};
  if (raw && typeof raw === "object") for (const [name, w] of Object.entries<any>(raw)) {
    if (!name.trim() || !w || !ok(w.atMs)) continue;
    const values = Object.fromEntries(Object.entries(w.values ?? {}).filter(([, v]) => ok(v))) as Record<string, number>;
    const o = w.odyle;
    const ap = (Array.isArray(w.apGains) ? w.apGains : []).filter((g: any) => g && ok(g.amount) && ok(g.atMs) && ["players", "mobs", "other"].includes(g.from))
      .map((g: any): ApGain => ({ amount: g.amount, atMs: g.atMs, abyss: !!g.abyss, from: g.from }));
    out[name] = { values, atMs: w.atMs, ...(o && ok(o.basic) && ok(o.charged) && ok(o.atMs) && { odyle: { basic: o.basic, charged: o.charged, atMs: o.atMs } }),
      ...(ap.length && { apGains: ap }) };
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

/**
 * The meter's Abyss Points gains into the owner's wallet, each once and only when AP_SETTLE_MS old, tagged with
 * where it came from: a PvP kill or assist of yours within AP_NEAR_MS (`kills`), else a mob kill of yours up to
 * AP_NEAR_MS before it (your loots, `kills.ts` / `souls.rs`), else "other". Older than AP_KEEP_MS are dropped.
 * Returns true if anything changed.
 */
export function takeApGains(all: Record<string, Wallet>, w: MeterWallet | null | undefined, pvp: { atMs: number; kind: string }[],
  loots: { atMs: number }[], now: number): boolean {
  const name = w?.owner?.trim();
  if (!w?.apGains?.length || !name) return false;
  const kept = (all[name] ??= { values: {}, atMs: 0 });
  const list = (kept.apGains ??= []);
  const last = list.at(-1)?.atMs ?? 0;
  let changed = false;
  for (const g of w.apGains) {
    if (g.atMs <= last || now - g.atMs < AP_SETTLE_MS) continue;
    const from: ApSource = pvp.some((k) => k.kind !== "death" && Math.abs(k.atMs - g.atMs) <= AP_NEAR_MS) ? "players"
      : loots.some((l) => l.atMs <= g.atMs && g.atMs - l.atMs <= AP_NEAR_MS) ? "mobs" : "other";
    list.push({ amount: g.amount, atMs: g.atMs, abyss: g.mapId === ABYSS_MAP, from });
    changed = true;
  }
  const old = list.findIndex((g) => now - g.atMs <= AP_KEEP_MS);
  if (old > 0) { list.splice(0, old); changed = true; }
  return changed;
}

/** Abyss Points gained since `sinceMs` (the daily reset): in all, and in the Abyss / elsewhere by source. */
export function apSince(w: Wallet, sinceMs: number) {
  const t = { total: 0, abyss: { players: 0, mobs: 0, other: 0 }, elsewhere: { players: 0, mobs: 0, other: 0 } };
  for (const g of w.apGains ?? []) if (g.atMs >= sinceMs) {
    t.total += g.amount;
    (g.abyss ? t.abyss : t.elsewhere)[g.from] += g.amount;
  }
  return t;
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
