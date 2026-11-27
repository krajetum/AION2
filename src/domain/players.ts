// Players page: the search results in pages, and the last characters opened (Recent, kept in localStorage). Pure.
import type { Found } from "./armory.ts";

export const PAGE_SIZE = 6;
export const RECENT_MAX = 5;

/** One page of a list: the page clamped to the ones there are; from / to 1-based (0 / 0 when empty). */
export function pageOf<T>(list: T[], page: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(list.length / size)), p = Math.min(Math.max(0, page), pages - 1);
  const items = list.slice(p * size, p * size + size);
  return { items, page: p, pages, from: items.length ? p * size + 1 : 0, to: p * size + items.length };
}

/** The page holding the first item `hit` matches, else 0. */
export function pageWith<T>(list: T[], hit: (x: T) => boolean, size = PAGE_SIZE): number {
  const i = list.findIndex(hit);
  return i < 0 ? 0 : Math.floor(i / size);
}

/** One character (id + server). Never `===`: a $state proxy is not its source object. */
export const sameCharacter = (a: Pick<Found, "characterId" | "serverId">, b: Pick<Found, "characterId" | "serverId">) =>
  a.characterId === b.characterId && a.serverId === b.serverId;

/** `c` first, any older entry of the same character removed, at most `max`. */
export const pushRecent = (list: Found[], c: Found, max = RECENT_MAX): Found[] =>
  [c, ...list.filter((x) => !sameCharacter(x, c))].slice(0, max);

/** Recent as read back from localStorage: only well-formed characters, at most RECENT_MAX. */
export function cleanRecent(raw: unknown): Found[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is Found => !!x && typeof x.characterId === "string" && typeof x.name === "string" && typeof x.serverId === "number"
    && typeof x.serverName === "string" && (x.level === null || typeof x.level === "number"))
    .map(({ characterId, name, level, serverId, serverName }) => ({ characterId, name, level, serverId, serverName })).slice(0, RECENT_MAX);
}
