// Redeem codes players share through the crowd Worker (Home > Codes): each lasts a week for everyone,
// 5 players marking one expired remove it. Pure: tested with `npm test`.

export interface RedeemCode { code: string; key: string; addedMs: number; expiresMs: number; votes: number }
/** What this install did with the codes, by key (the code in capitals). Account-wide: a code is redeemed once. */
export interface CodeMarks { redeemed: string[]; expired: string[] }

export const emptyMarks = (): CodeMarks => ({ redeemed: [], expired: [] });
export const EXPIRED_VOTES = 5; // mirror of the Worker's REDEEM_EXPIRED_VOTES
const MAX_MARKS = 200;

/** The Worker's check (server/src/validate.ts `redeemCode`): letters, digits, dashes, underscores, 4-40. */
const RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,38}[A-Za-z0-9]$/;
export const cleanCode = (v: string): string | null => (RE.test(v.trim()) ? v.trim() : null);
export const codeKey = (code: string) => code.toUpperCase();

/** The Worker's answer, its times moved onto the local clock (`localNow - serverNow`); junk entries dropped. */
export function parseCodes(j: any, localNow: number): RedeemCode[] {
  const shift = typeof j?.serverNow === "number" ? localNow - j.serverNow : 0;
  const out: RedeemCode[] = [];
  const seen = new Set<string>();
  for (const c of Array.isArray(j?.codes) ? j.codes : []) {
    const code = typeof c?.code === "string" ? cleanCode(c.code) : null;
    if (!code || typeof c.addedMs !== "number" || typeof c.expiresMs !== "number" || seen.has(codeKey(code))) continue;
    seen.add(codeKey(code));
    out.push({ code, key: codeKey(code), addedMs: c.addedMs + shift, expiresMs: c.expiresMs + shift, votes: typeof c.votes === "number" ? c.votes : 0 });
  }
  return out;
}

/** The marks cleaned from a save file (strings only, the newest MAX_MARKS). */
export function cleanMarks(v: any): CodeMarks {
  const list = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter((k): k is string => typeof k === "string").map(codeKey))].slice(-MAX_MARKS) : []);
  return { redeemed: list(v?.redeemed), expired: list(v?.expired) };
}

/** Turns a mark on or off (newest last). */
export function toggleMark(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key].slice(-MAX_MARKS);
}

/** Live codes this install hasn't redeemed nor marked expired, oldest expiry first (the ones to use first). */
export const toRedeem = (codes: RedeemCode[], m: CodeMarks, now: number) =>
  codes.filter((c) => c.expiresMs > now && !m.redeemed.includes(c.key) && !m.expired.includes(c.key)).sort((a, b) => a.expiresMs - b.expiresMs);

/** The reminder's text when you enter the game or change character: the codes, and on whom the rewards land. */
export function reminderText(codes: RedeemCode[], char: string): { title: string; body: string } {
  const shown = codes.slice(0, 3).map((c) => c.code).join(", ");
  const more = codes.length > 3 ? ` and ${codes.length - 3} more` : "";
  return {
    title: codes.length === 1 ? `Redeem the code! ${codes[0].code}` : `Redeem the codes! ${shown}${more}`,
    body: char ? `The rewards will go to ${char}, the character you are playing.` : "The rewards go to the character you are playing.",
  };
}

/** When to remind: a character entered the game (the app connected, or another character) that wasn't the last one reminded. */
export const shouldRemind = (char: string | undefined, lastReminded: string | null) => !!char && char !== lastReminded;

/** "6 d", "5 h", "12 min" left. */
export function leftText(ms: number): string {
  if (ms <= 0) return "ended";
  const h = ms / 3600_000;
  return h >= 24 ? `${Math.floor(h / 24)} d ${Math.floor(h % 24)} h left` : h >= 1 ? `${Math.floor(h)} h left` : `${Math.max(1, Math.floor(ms / 60_000))} min left`;
}
