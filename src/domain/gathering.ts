// Map page's gathering spots: what you gathered and where (the meter's `gathers`, src-tauri/meter/src/gather.rs), one
// spot per material and place, and the spots other players shared (the Worker, src/app/crowd.ts). Pure.

/** A gather as the meter sends it (game units; `exact` = the node's own place, else yours at the gather). */
export interface Gather { node: number | null; item: number; amount: number; x: number; y: number; z: number; exact: boolean; mapId: number | null; atMs: number }
/** Your spot of one material: `count` gathers, `amount` items in all. */
export interface GatherSpot { mapId: number; item: number; x: number; y: number; z: number; exact: boolean; count: number; amount: number; lastMs: number }
/** A spot other players reported: `n` = how many installs. */
export interface SharedGather { mapId: number; item: number; x: number; y: number; z: number; n: number }
/** `sentMs`: your spots gathered up to then are on the Worker (saved, so spots from before sharing, or before a restart, go too). */
export interface GatherData { spots: GatherSpot[]; seenMs: number; sentMs: number; shared: SharedGather[] }

/** Two gathers of one material closer than this (game units) are one spot: a node, with your place a few metres off. */
export const GATHER_SPOT = 500;
const MAX_SPOTS = 3000;

export const emptyGathering = (): GatherData => ({ spots: [], seenMs: 0, sentMs: 0, shared: [] });

const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const id = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0;

export function cleanGathering(raw: any): GatherData {
  const spots = (Array.isArray(raw?.spots) ? raw.spots : [])
    .filter((s: any) => s && id(s.mapId) && id(s.item) && ok(s.x) && ok(s.y) && ok(s.z) && id(s.count) && ok(s.amount) && ok(s.lastMs))
    .map((s: any): GatherSpot => ({ mapId: s.mapId, item: s.item, x: s.x, y: s.y, z: s.z, exact: !!s.exact, count: s.count, amount: s.amount, lastMs: s.lastMs }));
  return { spots, seenMs: ok(raw?.seenMs) ? raw.seenMs : 0, sentMs: ok(raw?.sentMs) ? raw.sentMs : 0, shared: cleanSharedGathers(raw?.shared) };
}

/** Shared spots, cleaned (saved data and the Worker's answer alike). */
export function cleanSharedGathers(raw: unknown): SharedGather[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((s: any) => s && id(s.mapId) && id(s.item) && ok(s.x) && ok(s.y) && ok(s.z) && id(s.n))
    .map((s: any): SharedGather => ({ mapId: s.mapId, item: s.item, x: s.x, y: s.y, z: s.z, n: s.n }));
}

/** Quest items a gather gives (631010004, no name or icon in the game's tables: the player's quest, 2026-11-23): not
 *  a material, never a spot. */
export const isQuestItem = (item: number) => item >= 631_010_000 && item < 631_020_000;

/** The meter's gathers not taken yet, with a map (one without waits: the meter fills it at the next map load). */
export const newGathers = (g: GatherData, list: Gather[]) =>
  list.filter((x) => x.mapId != null && x.atMs > g.seenMs && id(x.item) && !isQuestItem(x.item) && x.amount > 0 && ok(x.x) && ok(x.y) && ok(x.z));

/** Adds the meter's new gathers to your spots; returns the ones taken (to share). */
export function takeGathers(g: GatherData, list: Gather[]): Gather[] {
  const fresh = newGathers(g, list);
  for (const x of fresh) {
    const spot = g.spots.find((s) => s.mapId === x.mapId && s.item === x.item && Math.hypot(s.x - x.x, s.y - x.y) < GATHER_SPOT);
    if (spot) {
      spot.count++;
      spot.amount += x.amount;
      spot.lastMs = Math.max(spot.lastMs, x.atMs);
      if (x.exact && !spot.exact) Object.assign(spot, { x: x.x, y: x.y, z: x.z, exact: true }); // the node's own place wins
    } else {
      g.spots.push({ mapId: x.mapId!, item: x.item, x: x.x, y: x.y, z: x.z, exact: x.exact, count: 1, amount: x.amount, lastMs: x.atMs });
    }
    g.seenMs = Math.max(g.seenMs, x.atMs);
  }
  if (g.spots.length > MAX_SPOTS) g.spots.splice(0, g.spots.length - MAX_SPOTS);
  return fresh;
}

/** The gathered materials' grades: a node gives its material in any of them ("Fine Odyle", "Pure Odyle", "Radiant
 *  Odyle"; plants: "Fresh Azpha", "Fresh Calendula", 2026-11-23). */
const GRADE = /^(Fine|Pure|Radiant|Fresh) /;
/**
 * Each graded material's code → its plain one's ("Pure Odyle" → "Odyle"), by the names in the bundled recipes table
 * (`items`: code → name); a node is a spot of its plain material, whatever grade came out (2026-11-23: Pure Odyle and
 * Fine Ruby Gemstone were listed as materials of their own). A name with several codes: the smallest.
 */
export function baseMaterials(items: Record<string, string>): Map<number, number> {
  const byName = new Map<string, number>();
  for (const [code, name] of Object.entries(items)) {
    const c = Number(code), had = byName.get(name);
    if (Number.isInteger(c) && (had === undefined || c < had)) byName.set(name, c);
  }
  const out = new Map<number, number>();
  for (const [code, name] of Object.entries(items)) {
    const base = GRADE.test(name) ? byName.get(name.replace(GRADE, "")) : undefined;
    if (base !== undefined) out.set(Number(code), base);
  }
  return out;
}

/** One marker per material and place: yours, and others' not near one of yours of the same material. `base` = the
 *  plain material of a graded one (`baseMaterials`): your spots of its grades at one place are added up. */
export interface GatherMark { mapId: number; item: number; x: number; y: number; mine: GatherSpot | null; players: number }
export function gatherMarks(g: GatherData, base: Map<number, number> = new Map()): GatherMark[] {
  const plain = (item: number) => base.get(item) ?? item;
  const out: GatherMark[] = [];
  const near = (mapId: number, item: number, x: number, y: number) =>
    out.find((m) => m.mapId === mapId && m.item === item && Math.hypot(m.x - x, m.y - y) < GATHER_SPOT);
  for (const s of g.spots) {
    if (isQuestItem(s.item)) continue; // taken before quest items were left out
    const item = plain(s.item), at = near(s.mapId, item, s.x, s.y);
    if (!at) { out.push({ mapId: s.mapId, item, x: s.x, y: s.y, mine: { ...s, item }, players: 0 }); continue; }
    const m = at.mine!;
    if (s.exact && !m.exact) Object.assign(at, { x: s.x, y: s.y }), Object.assign(m, { x: s.x, y: s.y, z: s.z, exact: true });
    at.mine = { ...m, count: m.count + s.count, amount: m.amount + s.amount, lastMs: Math.max(m.lastMs, s.lastMs) };
  }
  for (const s of g.shared) {
    if (isQuestItem(s.item)) continue;
    const item = plain(s.item), at = near(s.mapId, item, s.x, s.y);
    if (at) at.players = Math.max(at.players, s.n);
    else out.push({ mapId: s.mapId, item, x: s.x, y: s.y, mine: null, players: s.n });
  }
  return out;
}

/** The materials on a set of marks, most spots first: [item, spots]. */
export function materials(marks: GatherMark[]): [number, number][] {
  const n = new Map<number, number>();
  for (const m of marks) n.set(m.item, (n.get(m.item) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}

/** The Worker takes at most this many per post (`server/src/validate.ts` MAX_GATHERS). */
export const SEND_BATCH = 100;
/** Your spots not on the Worker yet (gathered again since `sentMs`, or never sent), per map in batches, oldest first. */
export function toSend(g: GatherData): { mapId: number; spots: GatherSpot[] }[] {
  const by = new Map<number, GatherSpot[]>();
  for (const s of g.spots) if (s.lastMs > g.sentMs && !isQuestItem(s.item)) by.set(s.mapId, [...(by.get(s.mapId) ?? []), s]);
  const out: { mapId: number; spots: GatherSpot[] }[] = [];
  for (const [mapId, list] of by) {
    list.sort((a, b) => a.lastMs - b.lastMs);
    for (let i = 0; i < list.length; i += SEND_BATCH) out.push({ mapId, spots: list.slice(i, i + SEND_BATCH) });
  }
  return out;
}
