// The clock the winter theme reads. In `npm run dev` only, the URL can move it to try the theme before December:
// ?season=winter&day=12 = 12 December at the current time of day, ?season=newyear = ten seconds before midnight on 31 December.
// The clock keeps running from there.

function previewOffset(): number {
  if (!import.meta.env.DEV) return 0;
  const q = new URLSearchParams(location.search), now = new Date(), y = now.getFullYear();
  if (q.get("season") === "newyear") return new Date(y, 11, 31, 23, 59, 50).getTime() - now.getTime();
  if (q.get("season") !== "winter") return 0;
  const day = Math.max(1, Math.min(31, Math.round(Number(q.get("day")) || 1)));
  return new Date(y, 11, day, now.getHours(), now.getMinutes(), now.getSeconds()).getTime() - now.getTime();
}
const OFFSET = previewOffset();

/** The time the theme and the Advent calendar go by: the real one, outside a dev preview. */
export const winterNow = (now: number): number => now + OFFSET;
