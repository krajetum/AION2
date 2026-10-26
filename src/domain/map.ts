// Map page rules (src/ui/pages/Map.svelte): points the player puts on their own map image, clusters
// for zoomed-out views, pan/zoom math, and the fit from game coordinates to image pixels.
// Pure, no DOM. The image itself is never in the save file (infra/map-image.ts keeps it local).

/** The maps the page offers: one image each, with its own points and fit. */
export type MapKey = "asmodian" | "elyos" | "abyss";
export interface WorldMap {
  key: MapKey;
  name: string;
  /** The game's map ids (map loads, `21 36`) that this image shows. */
  gameIds: number[];
  /** The bundled image's game → pixel fit, null until one is known (the player's references then place you). */
  fit: Affine | null;
  /** Whether an image is bundled (src/assets/ncsoft/); without one the player imports their own. */
  bundled: boolean;
}

/** A hidden-cube spot, or a reference: a place whose game coordinates are known (for the fit). */
export type PointKind = "cube" | "ref";
export interface MapPoint {
  id: string;
  map: MapKey; // the image it was placed on
  x: number; y: number; // image pixels, x right, y down
  kind: PointKind;
  group: number; // index in GROUP_COLORS: cubes of one spawn group share it
  label: string;
  game?: { x: number; y: number }; // references: the game's coordinates of this place
}
/** A hidden cube seen opened (by the meter): where it stood, game units. Placed on the map through the fit. */
export interface FoundCube { x: number; y: number; z: number; code: number | null; atMs: number; byYou: boolean; mapId?: number | null }
/**
 * Where a pet's soul points dropped (game units, the map of the last map load). Recorded by the meter for
 * every kill of yours that gave soul points (`mob` = the mob, placed where it died; src-tauri/meter/src/souls.rs),
 * or by hand: the "Soul points here" button (your position then) or a click on a fitted map. Shared as a file
 * and merged. `pet` is the soul's name when recorded; for a mob's drops the player's name for its soul wins (`soulOf`).
 */
export interface PetDrop { id: string; pet: string; mob?: string; item?: number; kind?: number; mapId: number | null; map?: MapKey; x: number; y: number; z: number; atMs: number; by: string }
/** The page map a drop is on: the one it was recorded on, else the one its game map id belongs to. */
export const dropMap = (d: PetDrop): MapKey | null => d.map ?? mapOf(d.mapId);
/** Mob name (lower case) → the soul its kills give, as the player named it (a mob's name is not always its soul's). */
export type SoulNames = Record<string, string>;
/** The names the player gave: mob → soul (`souls`), item → crystal's soul (`items`), pet number → name (`petNames`). */
export interface Naming { souls: SoulNames; items?: SoulNames; petNames?: SoulNames }
/**
 * The soul a drop is of: a crystal's as its item is named now; a kill's as its pet number is named, else as its
 * mob is named now; else the name it was recorded with.
 */
export const soulOf = (n: Naming, d: PetDrop): string =>
  (d.item != null ? n.items?.[String(d.item)] : (d.kind != null && n.petNames?.[String(d.kind)]) || (d.mob && n.souls[d.mob.toLowerCase()])) || d.pet;
/** The pet number of a drop: the soul points' kind it came with, else the kind its mob was seen with (`kinds`). */
export function petOf(d: PetDrop, kinds: SoulNames): number | null {
  if (d.kind != null) return d.kind;
  if (d.item != null || !d.mob) return null;
  const k = Object.keys(kinds).find((k) => kinds[k] === d.mob);
  return k ? Number(k) : null;
}
export interface MapData {
  points: MapPoint[];
  found: FoundCube[];   // cubes opened in view, newest last
  cubeCodes: number[];  // object codes known to be hidden cubes (learned from openings)
  pets: PetDrop[];      // soul point drops recorded here or imported from friends' files
  souls: SoulNames;     // mob → the soul its kills give
  kinds: SoulNames;     // soul points' kind (= pet number) → the mob it was seen with (names kills whose mob was not seen spawning)
  petNames: SoulNames;  // pet number → the player's name for it (the game sends numbers only)
  items: SoulNames;     // item code → the soul it is a crystal / shard of (looted once a pet's collection is done)
  soulsSeenMs: number;  // the meter's soul kills up to this time are taken
}

/** Cube codes seen so far: 1301199, the cube of the 2026-10-23 20:18 recording (seen coming into view, then opened). */
export const KNOWN_CUBE_CODES = [1301199];
/** Two openings closer than this (game units) are the same spot. */
export const SAME_SPOT = 300;
const MAX_FOUND = 2000;

/** Spawn-group colors, picked to stay apart on the map's greens, browns and blues. */
export const GROUP_COLORS = ["#ff5a5f", "#ffb020", "#f5f05a", "#4fe08a", "#3fd6ff", "#5a8bff", "#c46bff", "#ff6bd0"];

export const emptyMap = (): MapData => ({ points: [], found: [], cubeCodes: [...KNOWN_CUBE_CODES], pets: [], souls: {}, items: {}, kinds: {}, petNames: {}, soulsSeenMs: 0 });

/** A saved or imported map section, cleaned: bad points are dropped, not guessed. */
export function cleanMap(raw: any): MapData {
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  const points = (Array.isArray(raw?.points) ? raw.points : [])
    .filter((p: any) => p && typeof p.id === "string" && ok(p.x) && ok(p.y))
    .map((p: any): MapPoint => ({
      id: p.id, map: isMapKey(p.map) ? p.map : "asmodian", x: p.x, y: p.y, // points before the map choice: the bundled world
      kind: p.kind === "ref" ? "ref" : "cube",
      group: Number.isInteger(p.group) && p.group >= 0 && p.group < GROUP_COLORS.length ? p.group : 0,
      label: typeof p.label === "string" ? p.label : "",
      ...(p.game && ok(p.game.x) && ok(p.game.y) && { game: { x: p.game.x, y: p.game.y } }),
    }));
  const found = (Array.isArray(raw?.found) ? raw.found : [])
    .filter((f: any) => f && ok(f.x) && ok(f.y) && ok(f.z) && ok(f.atMs))
    .map((f: any): FoundCube => ({ x: f.x, y: f.y, z: f.z, code: ok(f.code) ? f.code : null, atMs: f.atMs, byYou: !!f.byYou, ...(ok(f.mapId) && { mapId: f.mapId }) }));
  const codes = (Array.isArray(raw?.cubeCodes) ? raw.cubeCodes : []).filter((c: unknown) => Number.isInteger(c) && (c as number) > 0);
  return { points, found, cubeCodes: [...new Set([...KNOWN_CUBE_CODES, ...codes])].sort((a, b) => a - b), pets: cleanDrops(raw?.pets),
    souls: cleanSoulNames(raw?.souls), items: cleanSoulNames(raw?.items), kinds: cleanSoulNames(raw?.kinds), petNames: cleanSoulNames(raw?.petNames), soulsSeenMs: ok(raw?.soulsSeenMs) ? raw.soulsSeenMs : 0 };
}

export const isMapKey = (k: unknown): k is MapKey => k === "asmodian" || k === "elyos" || k === "abyss";

/**
 * The meter's cube news into the save: new codes, and openings not already found at the same spot
 * (an opening of the same spot later only refreshes its time). Returns true if anything changed.
 */
export function takeCubes(map: MapData, codes: number[], opened: FoundCube[], mapId: number | null = null): boolean {
  let changed = false;
  for (const c of codes) if (!map.cubeCodes.includes(c)) { map.cubeCodes.push(c); changed = true; }
  if (changed) map.cubeCodes.sort((a, b) => a - b);
  for (const o of opened) {
    const same = map.found.find((f) => Math.hypot(f.x - o.x, f.y - o.y) < SAME_SPOT);
    if (!same) { map.found.push({ ...o, ...(mapId != null && { mapId }) }); changed = true; }
    else if (o.atMs > same.atMs) { same.atMs = o.atMs; same.code ??= o.code; changed = true; }
  }
  if (map.found.length > MAX_FOUND) map.found.splice(0, map.found.length - MAX_FOUND);
  return changed;
}

/** Game units are taken as centimetres: the recorded walk ran ~790 units/s, about a running speed. */
export const toMetres = (units: number) => units / 100;

/** Height differences smaller than this (game units, ~3 m) count as the same level. */
export const SAME_LEVEL = 300;

/**
 * Up or down from you to a point: z is height (the 20:18 cube stood at z -70, under the bank the player
 * walked along at z 3,700-6,600, and the player was at z -68 when opening it). "level" within SAME_LEVEL.
 */
export function climb(from: { z: number }, to: { z: number }): { dz: number; way: "up" | "down" | "level" } {
  const dz = to.z - from.z;
  return { dz, way: Math.abs(dz) < SAME_LEVEL ? "level" : dz > 0 ? "up" : "down" };
}

/**
 * A point around you on a north-up radar of radius `r` px showing `range` game units: x east, y south.
 * Null when it is off the radar (with a margin, so dots at the rim still show).
 */
export function onRadar(you: { x: number; y: number }, p: { x: number; y: number }, range: number, r: number): { x: number; y: number } | null {
  const k = r / range, dx = (p.x - you.x) * k, dy = (p.y - you.y) * k;
  return Math.hypot(dx, dy) <= r * 1.05 ? { x: dx, y: dy } : null;
}

/** From you to a point, on the map's axes (x east, y south): distance in game units and a compass label. */
export function bearing(from: { x: number; y: number }, to: { x: number; y: number }): { dist: number; dir: string; deg: number } {
  const dx = to.x - from.x, dy = to.y - from.y;
  const deg = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360; // 0 = north (map up), clockwise
  const dir = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
  return { dist: Math.hypot(dx, dy), dir, deg };
}

// ---------- view: image pixel → screen = pixel * scale + offset ----------
export interface View { scale: number; x: number; y: number }

/** The whole image centred in a w × h viewport. */
export function fitView(imgW: number, imgH: number, w: number, h: number): View {
  const scale = Math.min(w / imgW, h / imgH);
  return { scale, x: (w - imgW * scale) / 2, y: (h - imgH * scale) / 2 };
}

/** Zoom by `factor` keeping the screen point (cx, cy) still, within [min, max] scale. */
export function zoomAt(v: View, factor: number, cx: number, cy: number, min: number, max: number): View {
  const scale = Math.min(max, Math.max(min, v.scale * factor));
  const k = scale / v.scale;
  return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
}

export const toImage = (v: View, sx: number, sy: number) => ({ x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale });
export const toScreen = (v: View, x: number, y: number) => ({ x: x * v.scale + v.x, y: y * v.scale + v.y });

// ---------- clusters ----------
export interface Cluster { x: number; y: number; points: MapPoint[] } // x, y: screen pixels

/**
 * Points closer than `radius` screen pixels at this zoom, merged into one marker at their centre
 * (greedy, in a stable order: the same points give the same clusters). Zooming in splits them.
 */
export function clusters(points: MapPoint[], v: View, radius: number): Cluster[] {
  const out: (Cluster & { sx: number; sy: number })[] = [];
  const sorted = [...points].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  for (const p of sorted) {
    const s = toScreen(v, p.x, p.y);
    const c = out.find((c) => Math.hypot(c.sx - s.x, c.sy - s.y) < radius);
    if (c) {
      c.points.push(p);
      c.x += (s.x - c.x) / c.points.length; // running centre
      c.y += (s.y - c.y) / c.points.length;
    } else out.push({ x: s.x, y: s.y, sx: s.x, sy: s.y, points: [p] });
  }
  return out.map(({ x, y, points }) => ({ x, y, points }));
}

// ---------- game coordinates → image pixels ----------
/** px = a·gx + b·gy + c, py = d·gx + e·gy + f */
export type Affine = [number, number, number, number, number, number];

/**
 * The least-squares affine fit from the references' game coordinates to their pixels.
 * Needs 3 references not on one line; null otherwise. More references average out click errors,
 * and `fitError` says how far they still are from the fit.
 */
export function fitAffine(refs: { game: { x: number; y: number }; x: number; y: number }[]): Affine | null {
  if (refs.length < 3) return null;
  // Normal equations: (AᵀA) [a b c] = Aᵀ px, same matrix for py; rows of A are [gx gy 1].
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
  for (const r of refs) {
    const row = [r.game.x, r.game.y, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) m[i][j] += row[i] * row[j];
      bx[i] += row[i] * r.x;
      by[i] += row[i] * r.y;
    }
  }
  const sx = solve3(m, bx), sy = solve3(m, by);
  return sx && sy ? [sx[0], sx[1], sx[2], sy[0], sy[1], sy[2]] : null;
}

/**
 * Game → pixel fit of the bundled world map (src/assets/ncsoft/world-map.webp), from the packet recording of
 * 2026-10-23: two teleports (exact) and three spots walked to, located on the map by matching the player's
 * screenshots. Residuals: 2-3 px for the teleports, up to 20 px for the walked spots (the player stood near,
 * not on, the icon). About 182 game units per pixel, no rotation, no mirroring.
 */
export const BUNDLED_FIT: Affine = [5.42103e-3, 4.33492e-5, 1494.327, 4.82447e-5, 5.57267e-3, 1657.268];
/** The map id of the bundled world (map loads of the same recording). Elsewhere the fit does not apply. */
export const WORLD_MAP_ID = 1110;

/**
 * Game → pixel fit of the bundled Abyss map (src/assets/ncsoft/abyss-map.webp), from the packet recording of
 * 2026-10-25 14:28-14:30 on map 20: where the player stood (14:28:52) and arrived after two teleports
 * (14:29:35, 14:30:11), marked 1-3 on a screenshot matched to the bundled image (scale 1.72). Three points
 * only, so no rotation is fitted (as on the world map): they stay within 24 px of it (about 25 m); the
 * player's references (3+) override it.
 */
export const ABYSS_FIT: Affine = [0.00921448, 0, 746.003, 0, 0.00939319, 654.083];

/**
 * Game → pixel fit of the bundled Elyos map (src/assets/ncsoft/elyos-map.webp), from the packet recording of
 * 2026-10-26 11:08-11:15 on map 1010 (its map load): where the player arrived (11:08:10) and stood 21 s near
 * Drana (11:11:48), against the arrow in screenshots matched to the bundled image (1:1, no rotation). Two
 * points, axis-aligned as the other fits; a third screenshot (Destroyed Temple) lies 60 px on from the last
 * position the recording has, along the way the player walked.
 */
export const ELYOS_FIT: Affine = [0.00556664, 0, 1775.92, 0, 0.00565312, 1343.75];

/**
 * The page's maps. Asmodian: the bundled world map and its fit (map 1110). Abyss: the player's screenshot
 * (2026-10-25), map 20 (the map loads of the same recording), ABYSS_FIT. Elyos (Verteron): the player's screenshot
 * (2026-10-25), map 1010 (map load and field-boss map of 2026-10-26), ELYOS_FIT.
 */
export const MAPS: WorldMap[] = [
  { key: "asmodian", name: "Asmodian", gameIds: [WORLD_MAP_ID], fit: BUNDLED_FIT, bundled: true },
  { key: "elyos", name: "Elyos", gameIds: [1010], fit: ELYOS_FIT, bundled: true },
  { key: "abyss", name: "Abyss", gameIds: [20], fit: ABYSS_FIT, bundled: true },
];
export const worldMap = (key: MapKey): WorldMap => MAPS.find((m) => m.key === key)!;
/**
 * Whether you, on game map `mapId`, are on page map `key`: a map whose ids are known claims them; a map
 * with none known yet (Elyos) takes any id no other map claims. An unknown map (null: the meter has seen
 * no map load and no field-boss map yet) is on none: placing it on the world map put Abyss positions in
 * the middle of the Asmodian map (2026-10-25).
 */
export function onMap(mapId: number | null, key: MapKey): boolean {
  if (mapId == null) return false;
  const owner = mapOf(mapId);
  return owner ? owner === key : worldMap(key).gameIds.length === 0;
}
/** The page's map for a game map id, if one shows it. */
export const mapOf = (mapId: number | null | undefined): MapKey | null =>
  mapId == null ? null : MAPS.find((m) => m.gameIds.includes(mapId))?.key ?? null;
/** Saved cubes from before map ids were kept were all opened on the bundled world. */
export const foundOn = (f: FoundCube, key: MapKey) => (f.mapId == null ? key === "asmodian" : mapOf(f.mapId) === key);

/** Pixel → game, the fit's inverse; null for a fit that squashes the plane. */
export function invertAffine(t: Affine): Affine | null {
  const [a, b, c, d, e, f] = t, det = a * e - b * d;
  if (!det) return null;
  return [e / det, -b / det, (b * f - c * e) / det, -d / det, a / det, (c * d - a * f) / det];
}

// ---------- pet soul point drops ----------
/** Pet names from the bundled data, before anyone records a drop (empty until a verified list is added). */
export const KNOWN_PETS: string[] = [];
const MAX_DROPS = 20_000;

/** Saved or imported drops, cleaned: bad entries dropped, ids unique. */
export function cleanDrops(raw: unknown): PetDrop[] {
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  const seen = new Set<string>(), out: PetDrop[] = [];
  for (const d of Array.isArray(raw) ? raw : []) {
    if (!d || typeof d.id !== "string" || typeof d.pet !== "string" || !d.pet.trim() || !ok(d.x) || !ok(d.y) || !ok(d.atMs) || seen.has(d.id)) continue;
    seen.add(d.id);
    out.push({ id: d.id, pet: d.pet.trim(), ...(typeof d.mob === "string" && d.mob.trim() && { mob: d.mob.trim() }), ...(ok(d.item) && { item: d.item }), ...(ok(d.kind) && { kind: d.kind }), mapId: ok(d.mapId) ? d.mapId : null, ...(isMapKey(d.map) && { map: d.map }), x: d.x, y: d.y, z: ok(d.z) ? d.z : 0, atMs: d.atMs, by: typeof d.by === "string" ? d.by : "" });
  }
  return out.slice(-MAX_DROPS);
}

export function cleanSoulNames(raw: unknown): SoulNames {
  const out: SoulNames = {};
  if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw)) if (k.trim() && typeof v === "string" && v.trim()) out[k.trim().toLowerCase()] = v.trim();
  return out;
}

/**
 * Adds drops not already there (by id): importing the same file twice adds nothing. A file's soul names fill in
 * mobs not named here (yours stay). Returns how many drops were new.
 */
export function mergeDrops(map: MapData, drops: PetDrop[], names: Partial<FileNames> = {}): number {
  for (const key of ["souls", "items", "petNames", "kinds"] as const)
    for (const [k, v] of Object.entries(cleanSoulNames(names[key]))) map[key][k] ??= v;
  const have = new Set(map.pets.map((d) => d.id));
  const fresh = cleanDrops(drops).filter((d) => !have.has(d.id));
  // A kill's pet number and mob name a pet (Pets page) as the meter's own kills do.
  for (const d of fresh) if (d.kind != null && d.mob && !d.mob.startsWith("Unknown mob #")) map.kinds[String(d.kind)] ??= d.mob;
  map.pets.push(...fresh);
  if (map.pets.length > MAX_DROPS) map.pets.splice(0, map.pets.length - MAX_DROPS);
  return fresh.length;
}

/** The names a drops file carries: mob → soul, crystal item → soul, pet number → the player's name and → its mob. */
export interface FileNames { souls: SoulNames; items: SoulNames; petNames: SoulNames; kinds: SoulNames }
/** The file friends send each other: format tag, version, all drops and the names. */
export const DROPS_FILE = "aion2-companion-pet-drops";
export const dropsFile = (map: Pick<MapData, "pets" | keyof FileNames>) =>
  ({ format: DROPS_FILE, version: 4, drops: map.pets, souls: map.souls, items: map.items, petNames: map.petNames, kinds: map.kinds });
/** A drops file's drops and names (older versions had fewer); throws on anything else. */
export function readDropsFile(raw: any): { drops: PetDrop[] } & FileNames {
  if (raw?.format !== DROPS_FILE || !Array.isArray(raw.drops)) throw new Error("not a pet drops file");
  return { drops: cleanDrops(raw.drops), souls: cleanSoulNames(raw.souls), items: cleanSoulNames(raw.items),
    petNames: cleanSoulNames(raw.petNames), kinds: cleanSoulNames(raw.kinds) };
}

/** A kill of yours that gave soul points, as the meter sends it (src/domain/meter.ts `SoulDrop`). */
export interface SoulKill { entity: number; x: number; y: number; z: number; mapId: number | null; kind?: number; points: number; atMs: number; mob: string }
/**
 * The name a kill gets while its mob is not known (its spawn unseen: it was in view before the meter ran).
 * The soul points' kind is the same for every kill of one mob (Highland Karnif 1097, Highland Sylphen 1045 in
 * the recording of 2026-10-26 11:29), so the first kill of a known mob of that kind names them all.
 */
export const unknownMob = (kind: number) => `Unknown mob #${kind}`;
/** Kills of one mob closer than this (game units, ~15 m) to one already saved add nothing: the map shows where, not how many. */
export const NEAR_DROP = 1500;

/**
 * The meter's soul kills into the drops: those after `soulsSeenMs`, one per mob and spot, on the page map of their
 * game map. A kill whose mob was not seen spawning is named by its kind (`kinds`, else `unknownMob`), and a later
 * kill of a known mob of the same kind renames those. Ids come from the kill, so a kill taken twice, or
 * merged back from a friend's copy of your file, is one drop. Returns true if anything changed.
 */
export function takeSouls(map: MapData, kills: SoulKill[], by: string): boolean {
  let changed = false;
  for (const k of kills) {
    if (k.atMs <= map.soulsSeenMs) continue;
    if (k.mapId == null) break; // the meter fills it in once it learns the map: these and later ones wait
    map.soulsSeenMs = k.atMs;
    changed = true;
    let mob = k.mob.trim();
    if (mob && k.kind != null && map.kinds[String(k.kind)] !== mob) {
      map.kinds[String(k.kind)] = mob;
      const placeholder = unknownMob(k.kind);
      for (const d of map.pets.filter((d) => d.mob === placeholder)) {
        d.mob = mob;
        if (d.pet === placeholder) d.pet = map.souls[mob.toLowerCase()] || mob;
      }
    }
    if (!mob && k.kind != null) mob = map.kinds[String(k.kind)] || unknownMob(k.kind);
    if (!mob) continue;
    const page = MAPS.find((m) => onMap(k.mapId, m.key))?.key;
    const near = map.pets.some((d) => d.mob?.toLowerCase() === mob.toLowerCase() && dropMap(d) === page && Math.hypot(d.x - k.x, d.y - k.y) < NEAR_DROP);
    if (near) continue;
    map.pets.push({
      id: `kill:${by || "?"}:${k.atMs}:${k.entity}`, pet: map.souls[mob.toLowerCase()] || mob, mob, ...(k.kind != null && { kind: k.kind }), mapId: k.mapId,
      ...(page && { map: page }), x: Math.round(k.x), y: Math.round(k.y), z: Math.round(k.z), atMs: k.atMs, by,
    });
  }
  if (map.pets.length > MAX_DROPS) map.pets.splice(0, map.pets.length - MAX_DROPS);
  return changed;
}

/** An item a mob you killed dropped for you, as the meter sends it (src/domain/meter.ts `LootDrop`). */
export interface LootKill { entity: number; item: number; x: number; y: number; z: number; mapId: number | null; atMs: number; mob: string }

/**
 * Your loots whose item is a named crystal / shard (`items`) into the drops, one per mob and spot, like
 * `takeSouls`. `seen` holds the loots already looked at (the meter resends its last 200 every update): the
 * caller empties it when an item is named, so the loots of this session are looked at again. Returns true if
 * a drop was added.
 */
export function takeLoots(map: MapData, loots: LootKill[], by: string, seen: Set<string>): boolean {
  let changed = false;
  for (const l of loots) {
    const key = `${l.atMs}:${l.entity}:${l.item}`;
    if (seen.has(key)) continue;
    const soul = map.items[String(l.item)];
    if (!soul || l.mapId == null) continue; // looked at again once named, or once the meter knows the map
    seen.add(key);
    const id = `loot:${by || "?"}:${key}`;
    if (map.pets.some((d) => d.id === id)) continue;
    const mob = l.mob.trim(), page = MAPS.find((m) => onMap(l.mapId, m.key))?.key;
    const near = map.pets.some((d) => d.item === l.item && (d.mob ?? "") === mob && dropMap(d) === page && Math.hypot(d.x - l.x, d.y - l.y) < NEAR_DROP);
    if (near) continue;
    map.pets.push({
      id, pet: soul, ...(mob && { mob }), item: l.item, mapId: l.mapId, ...(page && { map: page }),
      x: Math.round(l.x), y: Math.round(l.y), z: Math.round(l.z), atMs: l.atMs, by,
    });
    changed = true;
  }
  if (map.pets.length > MAX_DROPS) map.pets.splice(0, map.pets.length - MAX_DROPS);
  return changed;
}

export interface PetEntry { name: string; drops: number; maps: MapKey[]; mobs: string[] }
/**
 * Souls by name (known ones and every recorded one) with the mobs that drop them, filtered by `query` (any part of
 * the soul's or a mob's name, any case), A-Z.
 */
export function petList(drops: PetDrop[], query = "", n: Naming = { souls: {} }): PetEntry[] {
  const by = new Map<string, PetEntry>();
  const entry = (name: string) => {
    const k = name.toLowerCase();
    if (!by.has(k)) by.set(k, { name, drops: 0, maps: [], mobs: [] });
    return by.get(k)!;
  };
  for (const n of KNOWN_PETS) entry(n);
  for (const d of drops) {
    const e = entry(soulOf(n, d)), m = dropMap(d);
    e.drops++;
    if (m && !e.maps.includes(m)) e.maps.push(m);
    if (d.mob && !e.mobs.some((x) => x.toLowerCase() === d.mob!.toLowerCase())) e.mobs.push(d.mob);
  }
  for (const e of by.values()) e.mobs.sort((a, b) => a.localeCompare(b));
  const q = query.trim().toLowerCase();
  return [...by.values()]
    .filter((e) => !q || e.name.toLowerCase().includes(q) || e.mobs.some((m) => m.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The map with most of a soul's drops (the page switches to it), null when none is on a page map. */
export function petHome(drops: PetDrop[], pet: string, n: Naming = { souls: {} }): MapKey | null {
  const count = new Map<MapKey, number>();
  for (const d of drops) {
    const m = soulOf(n, d).toLowerCase() === pet.toLowerCase() ? dropMap(d) : null;
    if (m) count.set(m, (count.get(m) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export const applyAffine = (t: Affine, gx: number, gy: number) => ({ x: t[0] * gx + t[1] * gy + t[2], y: t[3] * gx + t[4] * gy + t[5] });

/** The largest distance, in image pixels, between a reference and where the fit puts it. */
export function fitError(t: Affine, refs: { game: { x: number; y: number }; x: number; y: number }[]): number {
  return Math.max(0, ...refs.map((r) => { const p = applyAffine(t, r.game.x, r.game.y); return Math.hypot(p.x - r.x, p.y - r.y); }));
}

/** Cramer's rule; null when the references are (nearly) on one line. */
function solve3(m: number[][], b: number[]): number[] | null {
  const det = (a: number[][]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  const scale = Math.max(...m.flat().map(Math.abs)) ** 3;
  if (!scale || Math.abs(d) < scale * 1e-12) return null;
  return [0, 1, 2].map((k) => det(m.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)))) / d);
}
