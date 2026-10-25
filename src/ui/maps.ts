// The page maps' bundled images (src/assets/ncsoft/, © NCSOFT, outside the GPL) and the fit each one uses.
import abyssMap from "../assets/ncsoft/abyss-map.webp";
import elyosMap from "../assets/ncsoft/elyos-map.webp";
import worldMapImage from "../assets/ncsoft/world-map.webp";
import { fitAffine, worldMap, type Affine, type MapKey, type MapPoint } from "../domain/map.ts";

/** The bundled image of a page map, null when none is bundled (the player imports one). */
export const BUNDLED_IMAGE: Record<MapKey, string | null> = { asmodian: worldMapImage, elyos: elyosMap, abyss: abyssMap };

/** The references with game coordinates placed on `map`. */
export const refsOn = (points: MapPoint[], map: MapKey) =>
  points.filter((p) => p.map === map && p.kind === "ref" && p.game).map((p) => ({ ...p, game: p.game! }));

/** The player's own fit for `map` (3+ references), else the bundled image's (not on an imported image). */
export const fitFor = (points: MapPoint[], map: MapKey, custom: boolean): Affine | null =>
  fitAffine(refsOn(points, map)) ?? (custom ? null : worldMap(map).fit);
