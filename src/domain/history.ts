// What the app remembers about past days (AppData.history): the daily cycles in which a character finished every
// daily task (Home's streak strip), and each character's Kina at the end of each day (the Wallet's sparkline). Pure.

/** Daily cycles kept per character, and days of Kina. */
export const MAX_CYCLES = 60;
export const MAX_KINA_DAYS = 30;
/** Kina and bound Kina (src/domain/wallet.ts CURRENCIES). */
const KINA = [930_100_031, 930_100_001];

export interface History {
  dailies: Record<string, number[]>; // character id → starts (epoch ms, the daily reset) of the cycles with every daily done, oldest first
  kina: Record<string, [number, number][]>; // character name → [local midnight, Kina + bound Kina as last seen that day], oldest first
}
export const emptyHistory = (): History => ({ dailies: {}, kina: {} });

/** A finished daily cycle (called by the reset, before it clears the progress): once per cycle, the last MAX_CYCLES kept. */
export function recordDaily(h: History, charId: string, cycleStart: number): void {
  const list = (h.dailies[charId] ??= []);
  if (cycleStart > 0 && !list.includes(cycleStart)) h.dailies[charId] = [...list, cycleStart].sort((a, b) => a - b).slice(-MAX_CYCLES);
}

/** The strip: `starts` = the last cycles' starts, newest (the running one) first; `today` = every daily done right now.
 *  Each cell says whether that cycle was finished. */
export const strip = (h: History, charId: string, starts: number[], today: boolean): boolean[] =>
  starts.map((s, i) => (i === 0 ? today : (h.dailies[charId] ?? []).includes(s)));

/** Days in a row with every daily done, from a strip (newest first). Today counts once done; not done yet, it
 *  doesn't break the run that ended yesterday. */
export function streak(cells: boolean[]): number {
  let n = 0;
  for (let i = cells[0] ? 0 : 1; i < cells.length && cells[i]; i++) n++;
  return n;
}

/** Local midnight of the day `now` is in. */
export const dayStart = (now: number): number => new Date(now).setHours(0, 0, 0, 0);

/** A character's Kina as last seen today (wallet values by item code). Returns true if the history changed. */
export function recordKina(h: History, name: string, values: Record<string, number>, now: number): boolean {
  if (!KINA.some((c) => values[c] != null)) return false;
  const total = KINA.reduce((n, c) => n + (values[c] ?? 0), 0), day = dayStart(now), list = (h.kina[name] ??= []);
  const last = list.at(-1);
  if (last && last[0] === day) {
    if (last[1] === total) return false;
    last[1] = total;
  } else list.push([day, total]);
  if (list.length > MAX_KINA_DAYS) h.kina[name] = list.slice(-MAX_KINA_DAYS);
  return true;
}

/** Old or imported saves: finite numbers only, sorted, capped. */
export function cleanHistory(raw: any): History {
  const h = emptyHistory();
  const num = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  for (const [id, list] of Object.entries(raw?.dailies ?? {}))
    if (Array.isArray(list)) h.dailies[id] = [...new Set(list.filter(num))].sort((a, b) => a - b).slice(-MAX_CYCLES);
  for (const [name, list] of Object.entries(raw?.kina ?? {}))
    if (Array.isArray(list)) h.kina[name] = list.filter((p): p is [number, number] => Array.isArray(p) && num(p[0]) && num(p[1]))
      .map((p): [number, number] => [p[0], p[1]]).sort((a, b) => a[0] - b[0]).slice(-MAX_KINA_DAYS);
  return h;
}
