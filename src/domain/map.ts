// Map page rules (src/ui/pages/Map.svelte): points the player puts on their own map image, clusters
// for zoomed-out views, pan/zoom math, and the fit from game coordinates to image pixels.
// Pure, no DOM. The image itself is never in the save file (infra/map-image.ts keeps it local).

/** A hidden-cube spot, or a reference: a place whose game coordinates are known (for the fit). */
export type PointKind = "cube" | "ref";
export interface MapPoint {
  id: string;
  x: number; y: number; // image pixels, x right, y down
  kind: PointKind;
  group: number; // index in GROUP_COLORS: cubes of one spawn group share it
  label: string;
  game?: { x: number; y: number }; // references: the game's coordinates of this place
}
/** A hidden cube seen opened (by the meter): where it stood, game units. Placed on the map through the fit. */
export interface FoundCube { x: number; y: number; z: number; code: number | null; atMs: number; byYou: boolean }
export interface MapData {
  points: MapPoint[];
  found: FoundCube[];   // cubes opened in view, newest last
  cubeCodes: number[];  // object codes known to be hidden cubes (learned from openings)
}

/** Cube codes seen so far: 1301199, the cube of the 2026-10-23 20:18 recording (seen coming into view, then opened). */
export const KNOWN_CUBE_CODES = [1301199];
/** Two openings closer than this (game units) are the same spot. */
export const SAME_SPOT = 300;
const MAX_FOUND = 2000;

/** Spawn-group colors, picked to stay apart on the map's greens, browns and blues. */
export const GROUP_COLORS = ["#ff5a5f", "#ffb020", "#f5f05a", "#4fe08a", "#3fd6ff", "#5a8bff", "#c46bff", "#ff6bd0"];

export const emptyMap = (): MapData => ({ points: [], found: [], cubeCodes: [...KNOWN_CUBE_CODES] });

/** A saved or imported map section, cleaned: bad points are dropped, not guessed. */
export function cleanMap(raw: any): MapData {
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  const points = (Array.isArray(raw?.points) ? raw.points : [])
    .filter((p: any) => p && typeof p.id === "string" && ok(p.x) && ok(p.y))
    .map((p: any): MapPoint => ({
      id: p.id, x: p.x, y: p.y,
      kind: p.kind === "ref" ? "ref" : "cube",
      group: Number.isInteger(p.group) && p.group >= 0 && p.group < GROUP_COLORS.length ? p.group : 0,
      label: typeof p.label === "string" ? p.label : "",
      ...(p.game && ok(p.game.x) && ok(p.game.y) && { game: { x: p.game.x, y: p.game.y } }),
    }));
  const found = (Array.isArray(raw?.found) ? raw.found : [])
    .filter((f: any) => f && ok(f.x) && ok(f.y) && ok(f.z) && ok(f.atMs))
    .map((f: any): FoundCube => ({ x: f.x, y: f.y, z: f.z, code: ok(f.code) ? f.code : null, atMs: f.atMs, byYou: !!f.byYou }));
  const codes = (Array.isArray(raw?.cubeCodes) ? raw.cubeCodes : []).filter((c: unknown) => Number.isInteger(c) && (c as number) > 0);
  return { points, found, cubeCodes: [...new Set([...KNOWN_CUBE_CODES, ...codes])].sort((a, b) => a - b) };
}

/**
 * The meter's cube news into the save: new codes, and openings not already found at the same spot
 * (an opening of the same spot later only refreshes its time). Returns true if anything changed.
 */
export function takeCubes(map: MapData, codes: number[], opened: FoundCube[]): boolean {
  let changed = false;
  for (const c of codes) if (!map.cubeCodes.includes(c)) { map.cubeCodes.push(c); changed = true; }
  if (changed) map.cubeCodes.sort((a, b) => a - b);
  for (const o of opened) {
    const same = map.found.find((f) => Math.hypot(f.x - o.x, f.y - o.y) < SAME_SPOT);
    if (!same) { map.found.push({ ...o }); changed = true; }
    else if (o.atMs > same.atMs) { same.atMs = o.atMs; same.code ??= o.code; changed = true; }
  }
  if (map.found.length > MAX_FOUND) map.found.splice(0, map.found.length - MAX_FOUND);
  return changed;
}

/** Game units are taken as centimetres: the recorded walk ran ~790 units/s, about a running speed. */
export const toMetres = (units: number) => units / 100;

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
