// Market prices over time: the meter's reads of market searches (src-tauri/meter/src/market.rs), one point per item
// and day (the lowest price per piece seen that day, as the crowd Worker keeps a vote), and the players' shared
// medians per server (server/: GET /v1/prices/:serverId). Pure.

export const DAY = 86_400_000;
/** Days of history kept (the Worker serves as many). */
export const KEEP_DAYS = 90;

/** A market search the meter read: the item and its lowest listing, Kina per piece. */
export interface MarketRead { code: number; price: number; atMs: number }
export interface PricePoint { day: number; price: number }
/** A shared day: the median of the installs' prices, and how many installs. */
export interface SharedPoint extends PricePoint { n: number }
/** Item code → your own points, oldest first. */
export type MarketData = Record<number, PricePoint[]>;

export const dayOf = (ms: number) => Math.floor(ms / DAY);

/** Takes the reads into the history (lowest of the day wins; old days pruned). Returns the points that changed:
 *  taking the same reads twice changes nothing, so the meter's whole list can be passed every update. */
export function takeReads(market: MarketData, reads: MarketRead[], now: number): { code: number; price: number }[] {
  const from = dayOf(now) - KEEP_DAYS;
  const changed = new Map<number, number>();
  for (const r of reads) {
    const day = dayOf(r.atMs);
    if (day < from || !(r.price > 0)) continue;
    const pts = (market[r.code] ??= []);
    const at = pts.findIndex((p) => p.day === day);
    if (at >= 0 && pts[at].price <= r.price) continue;
    if (at >= 0) pts[at] = { day, price: r.price };
    else { pts.push({ day, price: r.price }); pts.sort((a, b) => a.day - b.day); }
    changed.set(r.code, r.price);
  }
  for (const [code, pts] of Object.entries(market)) {
    const kept = pts.filter((p) => p.day >= from);
    if (kept.length) market[+code] = kept; else delete market[+code];
  }
  return [...changed].map(([code, price]) => ({ code, price }));
}

/** The latest read of each code (for the Crafting prices). */
export function latestReads(reads: MarketRead[]): Map<number, MarketRead> {
  const out = new Map<number, MarketRead>();
  for (const r of reads) {
    const seen = out.get(r.code);
    if (!seen || r.atMs > seen.atMs) out.set(r.code, r);
  }
  return out;
}

const pos = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0;

/** A saved or imported history, malformed points dropped. */
export function cleanMarket(raw: any): MarketData {
  const out: MarketData = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [code, pts] of Object.entries(raw)) {
    if (!pos(+code) || !Array.isArray(pts)) continue;
    const ok = pts.filter((p: any) => pos(p?.day) && pos(p?.price)).map((p: any) => ({ day: p.day, price: p.price }));
    if (ok.length) out[+code] = ok.sort((a, b) => a.day - b.day);
  }
  return out;
}

/** GET /v1/prices/:serverId → shared points per code; malformed ones dropped. */
export function parsePrices(j: any): Record<number, SharedPoint[]> {
  const out: Record<number, SharedPoint[]> = {};
  const items = j?.items;
  if (!items || typeof items !== "object") return out;
  for (const [code, pts] of Object.entries(items)) {
    if (!pos(+code) || !Array.isArray(pts)) continue;
    const ok = pts.filter((p: any) => pos(p?.day) && pos(p?.price) && pos(p?.n)).map((p: any) => ({ day: p.day, price: p.price, n: p.n }));
    if (ok.length) out[+code] = ok.sort((a, b) => a.day - b.day);
  }
  return out;
}

/** Sparkline path for points in a w×h box (x by day over the last `days`, y from min to max price), or "" under 2 points. */
export function sparkline(pts: PricePoint[], today: number, days: number, w: number, h: number): string {
  const shown = pts.filter((p) => p.day > today - days);
  if (shown.length < 2) return "";
  const lo = Math.min(...shown.map((p) => p.price)), hi = Math.max(...shown.map((p) => p.price));
  const x = (d: number) => ((d - (today - days + 1)) / (days - 1)) * w;
  const y = (v: number) => (hi === lo ? h / 2 : h - ((v - lo) / (hi - lo)) * h);
  return shown.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
}
