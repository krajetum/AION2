// Map page rules (src/ui/pages/Map.svelte): points the player puts on their own map image, clusters
// for zoomed-out views, pan/zoom math, and the fit from game coordinates to image pixels.
// Pure, no DOM. The image itself is never in the save file (infra/map-image.ts keeps it local).
import { KNOWN_PET_NAMES } from "./pet-names.ts";

/** The maps the page offers: one image each, with its own points and fit. */
export type MapKey = "asmodian" | "elyos" | "abyss" | "krao" | "urugugu" | "fire" | "draupnir" | "vakron" | "horn";
export interface WorldMap {
  key: MapKey;
  name: string;
  /** The game's map ids (map loads, `21 36`) that this image shows. */
  gameIds: number[];
  /** The bundled image's game → pixel fit, null until one is known (the player's references then place you). */
  fit: Affine | null;
  /** Whether an image is bundled (src/assets/ncsoft/); without one the player imports their own. */
  bundled: boolean;
  /** A dungeon: picked in the Map menu's dungeon list, not among the world maps. */
  dungeon?: boolean;
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
export interface PetDrop {
  id: string; pet: string; mob?: string; item?: number; kind?: number; mapId: number | null; map?: MapKey; x: number; y: number; z: number; atMs: number; by: string;
  /** The kind was not recorded with the kill but linked from its mob (`linkKinds`). */
  linked?: true;
  /** Other players' spot (the crowd Worker, `sharedDrops`), not saved among yours. */
  shared?: true;
}
/** The page map a drop is on: the one it was recorded on, else the one its game map id belongs to. */
export const dropMap = (d: PetDrop): MapKey | null => d.map ?? mapOf(d.mapId);
/** Mob name (lower case) → the soul its kills give, as the player named it (a mob's name is not always its soul's). */
export type SoulNames = Record<string, string>;
/** The names the player gave: mob → soul (`souls`), item → crystal's soul (`items`), pet number → name (`petNames`). */
export interface Naming { souls: SoulNames; items?: SoulNames; petNames?: SoulNames }
/**
 * The soul a drop is of: a crystal's as its item is named now; a kill's as the player named its pet number, else
 * its mob, else as the database names its pet number (pet-names.ts); else the name it was recorded with.
 */
export const soulOf = (n: Naming, d: PetDrop): string =>
  (d.item != null ? n.items?.[String(d.item)]
    : (d.kind != null && n.petNames?.[String(d.kind)]) || (d.mob && n.souls[d.mob.toLowerCase()]) || (d.kind != null && KNOWN_PET_NAMES[d.kind])) || d.pet;
/** The pet number of a drop: the soul points' kind it came with, else the kind its mob was seen with (`kinds`). */
export function petOf(d: PetDrop, kinds: SoulNames): number | null {
  if (d.kind != null) return d.kind;
  if (d.item != null || !d.mob) return null;
  const k = Object.keys(kinds).find((k) => kinds[k] === d.mob);
  return k ? Number(k) : null;
}
/** A cube spot other players reported (the crowd Worker, src/app/crowd.ts): n = how many installs saw it opened. */
export interface SharedCube { mapId: number; x: number; y: number; z: number; code: number | null; n: number }
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
  bundledDrops: string; // the bundled drops (src/assets/pet-drops.json) merged in, by their date: "" = none yet
  mobPets: Record<string, number>; // mob (lower case) → the pet its kills give, as the player set it (`linkKinds`)
  shared: SharedCube[]; // cube spots from other players, replaced at each download
  sharedSouls: SharedSoul[]; // soul point spots from other players, replaced at each download
  soulsSentMs: number;  // your kills up to this time were sent to the Worker (`soulsToSend`)
  soulsRev: number;     // SOULS_REV the shared soul spots were sent and learned under
}

/**
 * Bumped when the shared soul spots were wrong: a save from before forgets the Worker's spots, and a pet number's mob
 * your own kills show wins over one learned from them. 2: kills with no pet number were sent as the pet named like
 * their mob (Worker cleared, 0014). 3: until 2026-11-22 the meter gave a gain to the oldest kill waiting, often another
 * mob's (`souls.rs` `pick`), so a mob came out under several pets; only kills recorded from now on are sent
 * (soulsSentMs = your newest drop). The Worker's spots were kept (the player's choice).
 */
export const SOULS_REV = 3;

/** Cube codes seen so far: 1301199, the cube of the 2026-10-23 20:18 recording (seen coming into view, then opened). */
export const KNOWN_CUBE_CODES = [1301199];
/** Two openings closer than this (game units) are the same spot. */
export const SAME_SPOT = 300;
const MAX_FOUND = 2000;

/** Spawn-group colors, picked to stay apart on the map's greens, browns and blues. */
export const GROUP_COLORS = ["#ff5a5f", "#ffb020", "#f5f05a", "#4fe08a", "#3fd6ff", "#5a8bff", "#c46bff", "#ff6bd0"];

export const emptyMap = (): MapData => ({ points: [], found: [], cubeCodes: [...KNOWN_CUBE_CODES], pets: [], souls: {}, items: {}, kinds: {}, petNames: {}, soulsSeenMs: 0, bundledDrops: "", shared: [], mobPets: {}, sharedSouls: [], soulsSentMs: 0, soulsRev: SOULS_REV });

/** Shared spots, cleaned (saved data and the Worker's answer alike). */
export function cleanShared(raw: unknown): SharedCube[] {
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  return (Array.isArray(raw) ? raw : [])
    .filter((s: any) => s && Number.isInteger(s.mapId) && ok(s.x) && ok(s.y) && ok(s.z) && Number.isInteger(s.n) && s.n > 0)
    .map((s: any): SharedCube => ({ mapId: s.mapId, x: s.x, y: s.y, z: s.z, code: Number.isInteger(s.code) ? s.code : null, n: s.n }));
}

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
  const pets = cleanDrops(raw?.pets), fresh = raw?.soulsRev === SOULS_REV, kinds = cleanSoulNames(raw?.kinds);
  // Before SOULS_REV, pet numbers' mobs were also learned from the Worker's wrong spots: your own kills say otherwise.
  if (!fresh) for (const d of pets) if (d.kind != null && !d.linked && d.item == null && d.mob && !d.mob.startsWith("Unknown mob #")) kinds[String(d.kind)] = d.mob;
  learnKinds(kinds, pets); // drops imported before files named pets still name them
  const mobPets: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw?.mobPets ?? {})) if (k.trim() && Number.isInteger(v) && (v as number) > 0) mobPets[k.trim().toLowerCase()] = v as number;
  linkKinds({ pets, mobPets });
  return { points, found, cubeCodes: [...new Set([...KNOWN_CUBE_CODES, ...codes])].sort((a, b) => a - b), pets,
    souls: cleanSoulNames(raw?.souls), items: cleanSoulNames(raw?.items), kinds, petNames: cleanSoulNames(raw?.petNames), soulsSeenMs: ok(raw?.soulsSeenMs) ? raw.soulsSeenMs : 0,
    bundledDrops: typeof raw?.bundledDrops === "string" ? raw.bundledDrops : "", shared: cleanShared(raw?.shared), mobPets,
    sharedSouls: fresh ? cleanSharedSouls(raw?.sharedSouls) : [], soulsSentMs: fresh && ok(raw?.soulsSentMs) ? raw.soulsSentMs : Math.max(0, ...pets.map((d) => d.atMs)), soulsRev: SOULS_REV };
}

/** Pet number → mob, from drops that carry both (a kill's own; "Unknown mob #…" names nothing). Names already known stay. */
export function learnKinds(kinds: SoulNames, drops: PetDrop[]) {
  for (const d of drops) if (d.kind != null && !d.linked && d.mob && !d.mob.startsWith("Unknown mob #")) kinds[String(d.kind)] ??= d.mob;
}

/**
 * Kills recorded with no pet number (an app older than the numbers, friends' files, the bundled spots: 524 of
 * its 2,849) get their mob's: the pet the player set for that mob (`mobPets`), else the kind its other kills carried
 * most often (Withered Branch Spider: 1116 24 times, 1071 once). A crystal is not its mob's pet's: left alone.
 * Without a number a spot's pet is unknown, and "Only pets still to collect" kept showing finished ones (Old
 * Agrint, 2026-10-27). Returns how many drops changed.
 */
export function linkKinds(map: Pick<MapData, "pets" | "mobPets">): number {
  const counts = new Map<string, Map<number, number>>();
  for (const d of map.pets) if (d.kind != null && !d.linked && d.item == null && d.mob) {
    const m = d.mob.toLowerCase(), c = counts.get(m) ?? new Map<number, number>();
    c.set(d.kind, (c.get(d.kind) ?? 0) + 1);
    counts.set(m, c);
  }
  const most = (m: string) => [...(counts.get(m) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0];
  let changed = 0;
  for (const d of map.pets) {
    if (d.item != null || !d.mob || (d.kind != null && !d.linked)) continue;
    const m = d.mob.toLowerCase(), kind = map.mobPets[m] ?? most(m);
    if (kind == null || (d.kind === kind && d.linked)) continue;
    d.kind = kind;
    d.linked = true;
    changed++;
  }
  return changed;
}

export const isMapKey = (k: unknown): k is MapKey => k === "asmodian" || k === "elyos" || k === "abyss" || k === "krao" || k === "urugugu" || k === "fire" || k === "draupnir" || k === "vakron" || k === "horn";

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

/**
 * Your position stops coming while you ride a mount or fly: the game sends it only with map loads and your own buffs
 * (src-tauri/meter/src/position.rs). The recordings of 2026-11-14 held none while riding (10-23 s), sprinting on the
 * mount or gliding (13-23 s, boosts included); a buff of yours came when the wings opened, on landing and at each jump
 * on the mount (every ~1.3 s while jumping). Older than this, the radar and the cube popup say how old it is.
 */
export const STALE_POSITION_MS = 10_000;

/** Seconds since your position was read, when older than STALE_POSITION_MS; null while it is fresh. */
export function staleFor(pos: { atMs: number }, now: number): number | null {
  const age = now - pos.atMs;
  return age > STALE_POSITION_MS ? Math.round(age / 1000) : null;
}

/**
 * Why your position stands still, when the meter knows (src-tauri/meter/src/position.rs `Travel`): gliding (the wings'
 * flight time falling) or on a mount (got on, not off). Short, for the radar and the cube popup. Null on foot.
 */
export function travelNote(t: { mounted: boolean; gliding: boolean } | null | undefined): string | null {
  return t?.gliding ? "Gliding · updates on landing" : t?.mounted ? "On a mount · jump to update" : null;
}

/** Which marker draws you: a wing while gliding, a horse on a mount, else the plain dot. */
export const travelIcon = (t: { mounted: boolean; gliding: boolean } | null | undefined): "wings" | "mount" | null =>
  t?.gliding ? "wings" : t?.mounted ? "mount" : null;

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
 * Game → pixel fit of the bundled Krao Cave map (src/assets/ncsoft/krao-cave-map.webp), from the packet recording of
 * 2026-11-22 15:11 in the dungeon (map 600002, its map load): where the player stood at the entrance (0:08-0:46) and
 * at the teleport after the first boss (2:10-2:13), against the arrow's centre in two screenshots (the second a 1:1
 * crop of the first). Two points, axis-aligned as the other fits; the 15 positions walked in between all fall on the
 * cave, and the boss (Enhanced Harcon) died ~60 px from its icon, with the player at range. Two more runs the same day,
 * on two difficulties, loaded as 600002 and 600001: one layout, the same fit (their 47 positions fall on the cave, the
 * boss fights on the boss's icon).
 */
export const KRAO_FIT: Affine = [0.0255977, 0, 1453.145, 0, 0.0243289, 181.76];
/** Krao Cave's map ids, one per difficulty (map loads, recordings of 2026-11-22; 600004 = the last difficulty, its entrance on the same spot). */
export const KRAO_MAP_IDS = [600001, 600002, 600004];

/**
 * Game → pixel fit of the bundled Urugugu Canyon map (src/assets/ncsoft/urugugu-canyon-map.webp), from the packet
 * recording of 2026-11-22 15:23 (map 600011, its map load): where the player stood at the entrance, at the teleport
 * after the first boss (a crop of the map zoomed 1.26×, matched on the icons), and where the player (melee) killed
 * Guardian Captain Raur, against its icon. Axis-aligned least squares, within 7 px of the three. All three are in
 * the canyon's south-west third: the far end of the map (north-east) is extrapolated, the player's references
 * override it. Other difficulties loaded as 600012 and 600013, their entrance on the same spot: one layout.
 */
export const URUGUGU_FIT: Affine = [0.0128217, 0, 349.158, 0, 0.0129379, 764.511];
export const URUGUGU_MAP_IDS = [600011, 600012, 600013];

/**
 * Game → pixel fit of the bundled Fire Temple map (src/assets/ncsoft/fire-temple-map.webp), from the packet recording
 * of 2026-11-22 15:33 (map 600021, its map load): where the player stood at the entrance (0:22-0:26) and at the teleport
 * the run ended on (2:48-2:51), against the arrow's centre in two screenshots (the second the same zoom, shifted 72,
 * 22 px). Two points, axis-aligned; the 26 positions walked in between all fall on the temple. Another difficulty
 * loaded as 600022 and 600023, their first positions by the entrance on the same fit: one layout.
 */
export const FIRE_FIT: Affine = [0.0249233, 0, 815.726, 0, 0.0237369, 700.302];
export const FIRE_MAP_IDS = [600021, 600022, 600023];

/**
 * Game → pixel fit of the bundled Draupnir map (src/assets/ncsoft/draupnir-cave-map.webp: two of the player's
 * screenshots at the same zoom joined on the icons, the second 665 px above the first), from the packet recording of
 * 2026-11-22 15:56 (map 600031, its map load): where the player stood at the entrance and at the teleport in the
 * middle (two stops, 2:03-2:06), against the arrow's centre in a third screenshot matched to the first. Two points,
 * axis-aligned; the walk then reaches the west boss's icon (1:52, the player's soul points 2 s later). The northern
 * island was not walked. Three difficulties loaded as 600031-600033, their entrance on the same spot.
 */
export const DRAUPNIR_FIT: Affine = [0.0131774, 0, 775.009, 0, 0.0127707, 1138.835];
export const DRAUPNIR_MAP_IDS = [600031, 600032, 600033];

/**
 * Game → pixel fit of the bundled Vakron Sky Island map (src/assets/ncsoft/vakron-sky-island-map.webp: three of the
 * player's screenshots at the same zoom joined by matching them, the sea around them filled with its colour), from
 * the packet recording of 2026-11-22 16:02 (map 600071, its map load): where the player stood at the entrance and at
 * the teleport in the middle (2:29-2:32), against the arrow's centre in two more screenshots matched to the first.
 * Two points, axis-aligned (the same scale on both axes to 0.1%); two runs then walk the corridor to Tiere's icon.
 * The northern islands were not walked. Three difficulties loaded as 600071-600073, their entrance on the same spot.
 * Named after a guide (gamesfuze: "Vakron Sky Island Trial", bosses Tiere, Thamon, Vakron).
 */
export const VAKRON_FIT: Affine = [0.0219926, 0, 1015.466, 0, 0.0220082, 846.433];
export const VAKRON_MAP_IDS = [600071, 600072, 600073];

/**
 * Game → pixel fit of the bundled Ferocious Horn Den map (src/assets/ncsoft/ferocious-horn-den-map.webp: two of the
 * player's screenshots at the same zoom joined on the arrow and the boss icon), from the packet recording of
 * 2026-11-22 16:25 (map 600091): eleven screenshots taken where the player stopped, at every height of the den (13,200
 * to 17,500 and -12,900 to -8,300), each matched 1:1 to the picture, against where the recording had the player at
 * the screenshot's time. Least squares on the eight taken standing still: within 10 px of them, the same scale on
 * both axes to 0.1%; the three taken walking within 10-110 px. The walks of three runs follow the corridors. (A first
 * try put the entrance at the round room: that screenshot was taken 2 min into the run, not at the start.) Three
 * difficulties loaded as 600091-600093, their entrance on the same spot.
 */
export const HORN_FIT: Affine = [0.0265788, 0, 629.167, 0, 0.0265561, 1168.332];
export const HORN_MAP_IDS = [600091, 600092, 600093];

/**
 * The page's maps. Asmodian: the bundled world map and its fit (map 1110). Abyss: the player's screenshot
 * (2026-10-25), map 20 (the map loads of the same recording), ABYSS_FIT. Elyos (Verteron): the player's screenshot
 * (2026-10-25), map 1010 (map load and field-boss map of 2026-10-26), ELYOS_FIT. Krao Cave (a dungeon): the player's
 * screenshot (2026-11-22), maps 600001-600002, KRAO_FIT. Urugugu Canyon (a dungeon):
 * the player's screenshot (2026-11-22), map 600011, URUGUGU_FIT. Fire Temple (a dungeon):
 * the player's screenshot (2026-11-22), map 600021, FIRE_FIT. Draupnir (a dungeon):
 * two screenshots joined (2026-11-22), maps 600031-600033, DRAUPNIR_FIT. Vakron Sky Island
 * (a dungeon): three screenshots joined (2026-11-22), maps 600071-600073, VAKRON_FIT. Ferocious Horn
 * Den (a dungeon): two screenshots joined (2026-11-22), maps 600091-600093, HORN_FIT.
 */
export const MAPS: WorldMap[] = [
  { key: "asmodian", name: "Asmodian", gameIds: [WORLD_MAP_ID], fit: BUNDLED_FIT, bundled: true },
  { key: "elyos", name: "Elyos", gameIds: [1010], fit: ELYOS_FIT, bundled: true },
  { key: "abyss", name: "Abyss", gameIds: [20], fit: ABYSS_FIT, bundled: true },
  { key: "krao", name: "Krao Cave", gameIds: KRAO_MAP_IDS, fit: KRAO_FIT, bundled: true, dungeon: true },
  { key: "urugugu", name: "Urugugu Canyon", gameIds: URUGUGU_MAP_IDS, fit: URUGUGU_FIT, bundled: true, dungeon: true },
  { key: "fire", name: "Fire Temple", gameIds: FIRE_MAP_IDS, fit: FIRE_FIT, bundled: true, dungeon: true },
  { key: "draupnir", name: "Draupnir", gameIds: DRAUPNIR_MAP_IDS, fit: DRAUPNIR_FIT, bundled: true, dungeon: true },
  { key: "vakron", name: "Vakron Sky Island", gameIds: VAKRON_MAP_IDS, fit: VAKRON_FIT, bundled: true, dungeon: true },
  { key: "horn", name: "Ferocious Horn Den", gameIds: HORN_MAP_IDS, fit: HORN_FIT, bundled: true, dungeon: true },
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
    out.push({ id: d.id, pet: d.pet.trim(), ...(typeof d.mob === "string" && d.mob.trim() && { mob: d.mob.trim() }), ...(ok(d.item) && { item: d.item }), ...(ok(d.kind) && { kind: d.kind }), ...(ok(d.kind) && d.linked === true && { linked: true as const }), mapId: ok(d.mapId) ? d.mapId : null, ...(isMapKey(d.map) && { map: d.map }), x: d.x, y: d.y, z: ok(d.z) ? d.z : 0, atMs: d.atMs, by: typeof d.by === "string" ? d.by : "" });
  }
  return out.slice(-MAX_DROPS);
}

export function cleanSoulNames(raw: unknown): SoulNames {
  const out: SoulNames = {};
  if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw)) if (k.trim() && typeof v === "string" && v.trim()) out[k.trim().toLowerCase()] = v.trim();
  return out;
}

/** The same drop under another id (the bundled copy of a file you imported, or of your own kills): same time, spot and mob. */
const sameDrop = (d: PetDrop) => `${d.atMs}:${d.x}:${d.y}:${d.z}:${d.mob ?? d.pet}`;

/**
 * Adds drops not already there (by id, or by time and spot): importing the same file twice adds nothing. A file's
 * soul names fill in mobs not named here (yours stay). Returns how many drops were new.
 */
export function mergeDrops(map: MapData, drops: PetDrop[], names: Partial<FileNames> = {}): number {
  for (const key of ["souls", "items", "petNames", "kinds"] as const)
    for (const [k, v] of Object.entries(cleanSoulNames(names[key]))) map[key][k] ??= v;
  const have = new Set(map.pets.flatMap((d) => [d.id, sameDrop(d)]));
  const fresh = cleanDrops(drops).filter((d) => !have.has(d.id) && !have.has(sameDrop(d)));
  learnKinds(map.kinds, fresh); // a kill's pet number and mob name a pet (Pets page) as the meter's own kills do
  if (fresh.length) linkKinds(map);
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
/**
 * The drops bundled with the app (src/assets/pet-drops.json): the players' shared file of 2026-10-26, 2,849 spots on
 * the three maps, with the players' names taken out. Merged into every save once per bundle date, so spots the
 * player deletes stay deleted until a newer bundle.
 */
export const BUNDLED_DROPS = "2026-11-22";
/**
 * Bundles whose drops are already in a save that has merged them: only their corrections are taken, so spots the
 * player deleted stay deleted. 2026-11-22: 44 kills of one Abyss run (2026-10-26 17:36-17:40, an old build kept
 * the Asmodian map id) moved from map 1110 to the Abyss (20); they were drawn in the sea on the Asmodian map.
 */
const BUNDLES_MERGED = new Set(["2026-10-26"]);
/** Merges the bundled drops file unless this bundle was merged already; returns how many drops were new (-1: skipped). */
export function takeBundledDrops(map: MapData, raw: any): number {
  if (map.bundledDrops === BUNDLED_DROPS) return -1;
  const { drops, ...names } = readDropsFile(raw);
  const n = BUNDLES_MERGED.has(map.bundledDrops) ? 0 : mergeDrops(map, drops, names);
  fixDropMaps(map, drops);
  map.bundledDrops = BUNDLED_DROPS;
  return n;
}

/**
 * Puts each drop the bundle also has (by id, or same time, spot and mob: a copy from the players' file, under
 * whoever recorded it) on the bundle's map. Returns how many moved.
 */
export function fixDropMaps(map: MapData, bundle: PetDrop[]): number {
  const byKey = new Map<string, PetDrop>();
  for (const b of bundle) { byKey.set(b.id, b); byKey.set(sameDrop(b), b); }
  let moved = 0;
  for (const d of map.pets) {
    const b = byKey.get(d.id) ?? byKey.get(sameDrop(d));
    if (!b || d.shared || (d.mapId === b.mapId && d.map === b.map)) continue;
    d.mapId = b.mapId; d.map = b.map; moved++;
  }
  return moved;
}

/** A drops file's drops and names (older versions had fewer); throws on anything else. */
export function readDropsFile(raw: any): { drops: PetDrop[] } & FileNames {
  if (raw?.format !== DROPS_FILE || !Array.isArray(raw.drops)) throw new Error("not a pet drops file");
  return { drops: cleanDrops(raw.drops), souls: cleanSoulNames(raw.souls), items: cleanSoulNames(raw.items),
    petNames: cleanSoulNames(raw.petNames), kinds: cleanSoulNames(raw.kinds) };
}

/**
 * What a looted item probably is, by its code. From the loots seen (2026-10-25/26): every kill drops one item
 * coded 5346600xx-5346601xx (one code per mob: 534660178 every Mutated Forest Guardian, 534660061 every
 * Starturtle); the crystals named by players are 610531002 (Agrint), 610530014 and 610530011 (a maxed
 * Starturtle's). A guess from few codes: the player's naming decides, and "Show every loot" shows all.
 */
export function lootKind(item: number): "common" | "crystal" | "other" {
  if (item >= 534_660_000 && item < 534_670_000) return "common";
  if (item >= 610_530_000 && item < 610_540_000) return "crystal";
  return "other";
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
  for (const raw of kills) {
    if (raw.atMs <= map.soulsSeenMs) continue;
    // The map not known yet (the app started in game, no map load since): the one the mob's spots are on, else
    // these and later kills wait for the meter to learn it (a teleport, or the game's map opened).
    const mapId = raw.mapId ?? mapOfMob(map, raw.mob || (raw.kind != null ? map.kinds[String(raw.kind)] ?? "" : ""), raw.x, raw.y);
    if (mapId == null) break;
    const k = { ...raw, mapId };
    map.soulsSeenMs = k.atMs;
    changed = true;
    let mob = k.mob.trim();
    // Points paired with the wrong kill (the meter gives them to the oldest kill waiting: a Forest Guardian's to
    // a Thin Agrint, 2026-10-27 23:22): a mob whose kills always gave one pet, getting another's, places nothing.
    const usual = mob ? mobKind(map, mob) : null;
    if (usual != null && k.kind != null && k.kind !== usual) continue;
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

/**
 * The pet a mob's kills give, when the recorded ones agree: at least 3 kills carried a number (not linked) and all
 * the same. Null when fewer, or when they disagree (the meter pairs points with kills by order, so a few are off).
 */
export function mobKind(map: Pick<MapData, "pets">, mob: string): number | null {
  const m = mob.trim().toLowerCase();
  let kind: number | null = null, n = 0;
  for (const d of map.pets) {
    if (d.kind == null || d.linked || d.item != null || d.mob?.toLowerCase() !== m) continue;
    if (kind != null && d.kind !== kind) return null;
    kind = d.kind;
    n++;
  }
  return n >= 3 ? kind : null;
}

/** A known spot of the same mob this close (game units) or closer says which map a kill is on. */
export const SAME_MOB_NEAR = 30_000;
/**
 * The map a kill of `mob` at (x, y) is on, while the meter does not know it: the map id every recorded spot of
 * that mob has (yours, friends', the bundled ones), if one of them is within SAME_MOB_NEAR. A mob whose spots are
 * on two maps, or none near, says nothing (null).
 */
export function mapOfMob(map: Pick<MapData, "pets">, mob: string, x: number, y: number): number | null {
  const name = mob.trim().toLowerCase();
  if (!name) return null;
  const same = map.pets.filter((d) => d.mapId != null && d.item == null && d.mob?.toLowerCase() === name);
  const ids = new Set(same.map((d) => d.mapId));
  if (ids.size !== 1 || !same.some((d) => Math.hypot(d.x - x, d.y - y) <= SAME_MOB_NEAR)) return null;
  return same[0].mapId;
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
  // A mob gives one pet: it is listed under the pet most of its kills gave. Kills paired with another mob's points
  // (the meter gave a gain to the oldest kill waiting until 2026-11-22) put it under several.
  const perMob = new Map<string, Map<string, number>>();
  for (const d of drops) if (d.mob && d.item == null) {
    const m = d.mob.toLowerCase(), c = perMob.get(m) ?? new Map<string, number>(), p = soulOf(n, d).toLowerCase();
    c.set(p, (c.get(p) ?? 0) + 1);
    perMob.set(m, c);
  }
  const topOf = (mob: string) => [...(perMob.get(mob.toLowerCase()) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const d of drops) {
    const pet = soulOf(n, d), e = entry(pet), m = dropMap(d);
    e.drops++;
    if (m && !e.maps.includes(m)) e.maps.push(m);
    if (d.mob && (d.item != null || topOf(d.mob) === pet.toLowerCase()) && !e.mobs.some((x) => x.toLowerCase() === d.mob!.toLowerCase())) e.mobs.push(d.mob);
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

// ---------- pet farming route ----------
/** Spots of one soul this close (game units: 30 m) are one camp. */
export const CAMP_RADIUS = 3_000;
export interface Stop { pet: string; x: number; y: number; spots: number }

/** One stop per soul: its busiest spot, the drop with most of that soul's drops within `radius` (`spots`). */
export function petStops(drops: PetDrop[], n: Naming = { souls: {} }, radius = CAMP_RADIUS): Stop[] {
  const by = new Map<string, { pet: string; at: PetDrop[] }>();
  for (const d of drops) {
    const pet = soulOf(n, d), k = pet.toLowerCase();
    if (!by.has(k)) by.set(k, { pet, at: [] });
    by.get(k)!.at.push(d);
  }
  // ponytail: every pair of a soul's drops is compared (O(k²) per soul); a grid if a soul gets thousands of spots.
  return [...by.values()].map(({ pet, at }) => {
    let best = at[0], most = 0;
    for (const a of at) {
      const near = at.filter((b) => Math.hypot(a.x - b.x, a.y - b.y) <= radius).length;
      if (near > most) { most = near; best = a; }
    }
    return { pet, x: best.x, y: best.y, spots: most };
  });
}

type XY = { x: number; y: number };
/** The length of a path through `points`, in their units. */
export const pathLength = (points: XY[]) => points.reduce((s, p, i) => s + (i ? Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) : 0), 0);

/**
 * An order to visit `stops` in, from `start` (you) or else from the first stop, not coming back: the nearest stop
 * next, then 2-opt (a stretch of the path is turned round while that shortens it). Straight lines: the game's
 * terrain, teleports and gliding are not known, so it is a good order, not the shortest walk.
 */
export function route<T extends XY>(stops: T[], start?: XY | null): T[] {
  const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
  const left: XY[] = [...stops], path: XY[] = [start ?? left.shift()!];
  if (!path[0]) return [];
  while (left.length) {
    const from = path[path.length - 1];
    let k = 0;
    for (let i = 1; i < left.length; i++) if (dist(from, left[i]) < dist(from, left[k])) k = i;
    path.push(...left.splice(k, 1));
  }
  for (let better = true; better; ) {
    better = false;
    for (let i = 1; i < path.length - 1; i++) for (let j = i + 1; j < path.length; j++) {
      const a = path[i - 1], b = path[i], c = path[j], d = path[j + 1];
      if (dist(a, c) + (d ? dist(b, d) : 0) < dist(a, b) + (d ? dist(c, d) : 0) - 1e-9) {
        path.splice(i, j - i + 1, ...path.slice(i, j + 1).reverse());
        better = true;
      }
    }
  }
  return (start ? path.slice(1) : path) as T[];
}

// ---- Soul point spots shared with other players (the crowd Worker's /v1/souls, src/app/crowd.ts) ----

/** A soul point spot other players reported: their kills of one pet within one 500-unit cell, averaged; n = installs. */
export interface SharedSoul { mapId: number; kind: number; mob: string; x: number; y: number; z: number; n: number; atMs: number }
/** Shared soul spots, cleaned (saved data and the Worker's answer alike). */
export function cleanSharedSouls(raw: unknown): SharedSoul[] {
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  return (Array.isArray(raw) ? raw : [])
    .filter((s: any) => s && Number.isInteger(s.mapId) && s.mapId > 0 && Number.isInteger(s.kind) && s.kind > 0 && ok(s.x) && ok(s.y) && ok(s.z))
    .map((s: any): SharedSoul => ({ mapId: s.mapId, kind: s.kind, mob: typeof s.mob === "string" ? s.mob.trim().slice(0, 40) : "",
      x: Math.round(s.x), y: Math.round(s.y), z: Math.round(s.z), n: Number.isInteger(s.n) && s.n > 0 ? s.n : 1, atMs: ok(s.atMs) ? s.atMs : 0 }));
}

/** Kills sent per request (the Worker takes at most 100). */
export const SOUL_BATCH = 100;
export interface SoulBatch { mapId: number; souls: { x: number; y: number; z: number; kind: number; mob: string; atMs: number }[]; lastMs: number }
/**
 * Your spots to share, oldest first, in runs of one map of at most SOUL_BATCH: the ones recorded by one of `mine`,
 * your characters' names — your meter's kills (`takeSouls`) and the ones you placed by hand (`addDrop`), from before
 * sharing too (once); friends' files carry their names and the bundled spots none, so they stay out, as crystals do.
 * Each needs a sure pet number and a known map, and comes after `soulsSentMs`: a kill's own (the meter's), or the one
 * you set for its mob (`mobPets`); a spot placed by hand (no mob) by the pet's name as you or the database name it.
 * Never a kill's mob as a pet's name, nor a guess from its other kills: a mob's pet is often named otherwise (Young
 * Slink kills give Slink soul points). A mob not seen spawning goes without its name.
 */
export function soulsToSend(map: Pick<MapData, "pets" | "soulsSentMs" | "petNames" | "mobPets">, mine: Set<string>): SoulBatch[] {
  const gameMap = (d: PetDrop) => d.mapId ?? (d.map ? worldMap(d.map).gameIds[0] ?? null : null);
  const byName = new Map<string, number>();
  for (const [k, n] of Object.entries(KNOWN_PET_NAMES)) byName.set(n.toLowerCase(), Number(k));
  for (const [k, n] of Object.entries(map.petNames)) byName.set(n.toLowerCase(), Number(k));
  const kindOf = (d: PetDrop): number | null => {
    if (d.mob) return d.kind != null && (!d.linked || map.mobPets[d.mob.toLowerCase()] === d.kind) ? d.kind : null;
    return d.kind ?? byName.get(d.pet.trim().toLowerCase()) ?? null;
  };
  const own = map.pets
    .filter((d) => mine.has(d.by) && !d.shared && d.item == null && d.atMs > map.soulsSentMs && gameMap(d) != null && kindOf(d) != null)
    .sort((a, b) => a.atMs - b.atMs);
  const out: SoulBatch[] = [];
  for (const d of own) {
    const mapId = gameMap(d)!, last = out[out.length - 1];
    const soul = { x: d.x, y: d.y, z: d.z, kind: kindOf(d)!, mob: d.mob && !d.mob.startsWith("Unknown mob #") ? d.mob : "", atMs: d.atMs };
    if (last && last.mapId === mapId && last.souls.length < SOUL_BATCH) { last.souls.push(soul); last.lastMs = d.atMs; }
    else out.push({ mapId, souls: [soul], lastMs: d.atMs });
  }
  return out;
}

/**
 * Other players' spots as drops, for the map and the Pets page: on a page map, named by the pet's mob (theirs, else
 * the one known here), and left out where a drop of yours of the same pet is within NEAR_DROP (yours are enough there).
 */
export function sharedDrops(map: Pick<MapData, "pets" | "sharedSouls" | "kinds" | "mobPets">): PetDrop[] {
  if (!map.sharedSouls.length) return [];
  // A mob whose pet is known here (set by you, or every one of 3+ kills of yours with the meter's number) gives that
  // pet only: a spot of it under another pet is someone's wrong pairing.
  const known = new Map<string, number | null>();
  const petOfMob = (mob: string) => {
    const m = mob.toLowerCase();
    if (!known.has(m)) known.set(m, map.mobPets[m] ?? mobKind(map, mob));
    return known.get(m)!;
  };
  const cell = (x: number) => Math.floor(x / NEAR_DROP);
  const own = new Map<string, PetDrop[]>();
  for (const d of map.pets) {
    const kind = petOf(d, map.kinds), page = dropMap(d);
    if (kind == null || !page) continue;
    const key = `${page}|${kind}|${cell(d.x)}|${cell(d.y)}`;
    own.get(key)?.push(d) ?? own.set(key, [d]);
  }
  const out: PetDrop[] = [];
  for (const s of map.sharedSouls) {
    const page = mapOf(s.mapId);
    if (!page) continue;
    let near = false;
    for (let i = -1; i <= 1 && !near; i++) for (let j = -1; j <= 1 && !near; j++)
      near = !!own.get(`${page}|${s.kind}|${cell(s.x) + i}|${cell(s.y) + j}`)?.some((d) => Math.hypot(d.x - s.x, d.y - s.y) < NEAR_DROP);
    if (near) continue;
    const pet = s.mob ? petOfMob(s.mob) : null;
    if (pet != null && pet !== s.kind) continue;
    const mob = s.mob || map.kinds[String(s.kind)] || unknownMob(s.kind);
    out.push({ id: `shared:${s.mapId}:${s.kind}:${s.x}:${s.y}`, pet: mob, mob, kind: s.kind, mapId: s.mapId, map: page, x: s.x, y: s.y, z: s.z,
      atMs: s.atMs, by: s.n === 1 ? "another player" : `${s.n} other players`, shared: true });
  }
  return out;
}

/** Your drops and other players' spots (`sharedDrops`): what the map and the Pets page show. */
export const allDrops = (map: Pick<MapData, "pets" | "sharedSouls" | "kinds" | "mobPets">): PetDrop[] =>
  map.sharedSouls.length ? [...map.pets, ...sharedDrops(map)] : map.pets;

/** The shared spots' mob names name pets this app has not seen yet (Pets page, `soulOf`). Names already known stay. */
export function learnSharedKinds(map: Pick<MapData, "sharedSouls" | "kinds">) {
  for (const s of map.sharedSouls) if (s.mob && !s.mob.startsWith("Unknown mob #")) map.kinds[String(s.kind)] ??= s.mob;
}
