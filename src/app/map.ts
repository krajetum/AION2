// Map page use cases: points on the player's own map image (cube spots and references).
import type { MapPoint, PointKind } from "../domain/map.ts";
import type { AppData } from "../domain/types.ts";

export function addPoint(data: AppData, x: number, y: number, kind: PointKind, group: number): MapPoint {
  const p: MapPoint = { id: crypto.randomUUID(), x: Math.round(x), y: Math.round(y), kind, group, label: "" };
  data.map.points.push(p);
  return p;
}

const find = (data: AppData, id: string) => data.map.points.find((p) => p.id === id);

export function deletePoint(data: AppData, id: string) {
  data.map.points = data.map.points.filter((p) => p.id !== id);
}
export function setPointLabel(data: AppData, id: string, label: string) { const p = find(data, id); if (p) p.label = label.trim(); }
export function setPointGroup(data: AppData, id: string, group: number) { const p = find(data, id); if (p) p.group = group; }
export function setPointKind(data: AppData, id: string, kind: PointKind) {
  const p = find(data, id);
  if (!p) return;
  p.kind = kind;
  if (kind === "cube") delete p.game;
}
/** A reference's game coordinates; an empty or invalid field clears them. */
export function setPointGame(data: AppData, id: string, gx: string, gy: string) {
  const p = find(data, id);
  if (!p) return;
  const x = parseFloat(gx), y = parseFloat(gy);
  if (Number.isFinite(x) && Number.isFinite(y)) p.game = { x, y };
  else delete p.game;
}
