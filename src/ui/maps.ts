// The page maps' bundled images (src/assets/ncsoft/, © NCSOFT, outside the GPL) and the fit each one uses.
import abyssMap from "../assets/ncsoft/abyss-map.webp";
import draupnirMap from "../assets/ncsoft/draupnir-cave-map.webp";
import elyosMap from "../assets/ncsoft/elyos-map.webp";
import hornMap from "../assets/ncsoft/ferocious-horn-den-map.webp";
import arkanisMap from "../assets/ncsoft/shattered-arkanis-map.webp";
import fireMap from "../assets/ncsoft/fire-temple-map.webp";
import kraoMap from "../assets/ncsoft/krao-cave-map.webp";
import uruguguMap from "../assets/ncsoft/urugugu-canyon-map.webp";
import vakronMap from "../assets/ncsoft/vakron-sky-island-map.webp";
import worldMapImage from "../assets/ncsoft/world-map.webp";
import { fitAffine, worldMap, type Affine, type MapKey, type MapPoint } from "../domain/map.ts";

/** The bundled image of a page map, null when none is bundled (the player imports one). */
export const BUNDLED_IMAGE: Record<MapKey, string | null> = { asmodian: worldMapImage, elyos: elyosMap, abyss: abyssMap, krao: kraoMap, urugugu: uruguguMap, fire: fireMap, draupnir: draupnirMap, vakron: vakronMap, horn: hornMap, arkanis: arkanisMap };

/** The references with game coordinates placed on `map`. */
export const refsOn = (points: MapPoint[], map: MapKey) =>
  points.filter((p) => p.map === map && p.kind === "ref" && p.game).map((p) => ({ ...p, game: p.game! }));

/** The player's own fit for `map` (3+ references), else the bundled image's (not on an imported image). */
export const fitFor = (points: MapPoint[], map: MapKey, custom: boolean): Affine | null =>
  fitAffine(refsOn(points, map)) ?? (custom ? null : worldMap(map).fit);
