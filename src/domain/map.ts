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
export interface MapData { points: MapPoint[] }

/** Spawn-group colors, picked to stay apart on the map's greens, browns and blues. */
export const GROUP_COLORS = ["#ff5a5f", "#ffb020", "#f5f05a", "#4fe08a", "#3fd6ff", "#5a8bff", "#c46bff", "#ff6bd0"];

export const emptyMap = (): MapData => ({ points: [] });

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
  return { points };
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
