// Market prices: the meter's market reads into the history and the Crafting prices, queued for the crowd Worker;
// other players' medians for your server on demand (the Crafting page).
import { latestReads, parsePrices, takeReads, type SharedPoint } from "../domain/market.ts";
import type { MeterUpdate } from "../domain/meter.ts";
import type { AppData } from "../domain/types.ts";
import { crowd } from "../infra/crowd.ts";

// ponytail: queued in memory, an app close drops up to a minute of prices; persist it if that ever matters.
const queue = new Map<number, number>(); // code → lowest price to send

/** Takes the update's market reads. Returns true if it changed data (needs saving). */
export function takeMarket(data: AppData, u: MeterUpdate): boolean {
  if (u.demo || !u.market?.length) return false;
  const changed = takeReads(data.market, u.market, Date.now());
  for (const c of changed) queue.set(c.code, Math.min(c.price, queue.get(c.code) ?? Infinity));
  // The Crafting price follows the newest read of its item.
  const latest = latestReads(u.market);
  let priced = false;
  for (const it of Object.values(data.crafting.items)) {
    const r = it.code ? latest.get(it.code) : undefined;
    if (!r || (it.priceAt ?? 0) >= r.atMs) continue;
    it.price = r.price;
    it.priceAt = r.atMs;
    priced = true;
  }
  return changed.length > 0 || priced;
}

/** Sends the queued prices (every minute), when sharing is on and the server is known. */
export async function flushPrices(data: AppData) {
  if (!queue.size) return;
  if (!data.settings.crowdShare || !data.serverId) return void queue.clear();
  const prices = [...queue].slice(0, 100).map(([code, price]) => ({ code, price }));
  for (const p of prices) queue.delete(p.code);
  await crowd("/v1/prices", { install: data.install, serverId: data.serverId, prices }).catch((e) => console.warn("Crowd price upload failed", e));
}

/** Other players' daily medians on your server for these items; {} without a server or on failure. */
export async function sharedPrices(data: AppData, codes: number[]): Promise<Record<number, SharedPoint[]>> {
  const list = [...new Set(codes)].filter((c) => c > 0).sort((a, b) => a - b).slice(0, 200);
  if (!data.serverId || !list.length) return {};
  try { return parsePrices(await crowd(`/v1/prices/${data.serverId}?codes=${list.join(",")}`)); }
  catch (e) { console.warn("Crowd price download failed", e); return {}; }
}
