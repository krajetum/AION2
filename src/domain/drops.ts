// Twitch Drops campaigns players share through the crowd Worker (Home > Twitch Drops): each listed until it ends,
// 5 players saying it's wrong or over remove it. Claimed / wrong marks reuse the redeem codes' (`CodeMarks`). Pure.
import { codeKey } from "./codes.ts";

export interface TwitchDrop { title: string; key: string; rewards: string; url: string | null; addedMs: number; startsMs: number | null; endsMs: number; votes: number }

export const DROP_VOTES = 5; // mirror of the Worker's DROP_EXPIRED_VOTES
export const MAX_TITLE = 80;   // mirrors of the Worker's MAX_DROP_TITLE / MAX_DROP_REWARDS / DROP_MAX_AHEAD
export const MAX_REWARDS = 300;
export const MAX_AHEAD = 60 * 24 * 3600_000;
export const CAMPAIGNS_URL = "https://www.twitch.tv/drops/campaigns";
const TWITCH_URL = /^https:\/\/(www\.)?twitch\.tv\/[\w\-./?=&%#]{0,200}$/;

/** One campaign per title, whatever its case or spacing (in capitals, as `CodeMarks` keep keys). */
export const dropKey = (title: string) => codeKey(title.trim().replace(/\s+/g, " "));

/** The Worker's answer, its times moved onto the local clock (`localNow - serverNow`); junk entries dropped. */
export function parseDrops(j: any, localNow: number): TwitchDrop[] {
  const shift = typeof j?.serverNow === "number" ? localNow - j.serverNow : 0;
  const out: TwitchDrop[] = [];
  const seen = new Set<string>();
  for (const d of Array.isArray(j?.drops) ? j.drops : []) {
    if (typeof d?.title !== "string" || typeof d.addedMs !== "number" || typeof d.endsMs !== "number") continue;
    const title = d.title.trim().slice(0, MAX_TITLE), key = dropKey(title);
    if (title.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push({
      title, key, rewards: typeof d.rewards === "string" ? d.rewards.slice(0, MAX_REWARDS) : "",
      url: typeof d.url === "string" && TWITCH_URL.test(d.url) ? d.url : null,
      addedMs: d.addedMs + shift, startsMs: typeof d.startsMs === "number" ? d.startsMs + shift : null, endsMs: d.endsMs + shift,
      votes: typeof d.votes === "number" ? d.votes : 0,
    });
  }
  return out;
}

export interface DropDraft { title: string; rewards: string; url: string; ends: string } // ends = a datetime-local value
/** The form's campaign as the Worker takes it, or what's wrong with it. */
export function cleanDrop(f: DropDraft, now: number): { title: string; rewards: string; url: string | null; endsMs: number } | string {
  const title = f.title.trim().replace(/\s+/g, " ");
  if (title.length < 3 || title.length > MAX_TITLE) return `A title is 3-${MAX_TITLE} characters.`;
  const endsMs = Date.parse(f.ends); // datetime-local: local time
  if (!Number.isFinite(endsMs) || endsMs <= now) return "The end must be in the future.";
  if (endsMs > now + MAX_AHEAD) return "The end must be within 60 days.";
  const url = f.url.trim();
  if (url && !TWITCH_URL.test(url)) return "The link must be a https://www.twitch.tv/… page.";
  return { title, rewards: f.rewards.trim().slice(0, MAX_REWARDS), url: url || null, endsMs: Math.floor(endsMs) };
}

/** Live campaigns not claimed nor marked wrong, soonest end first. */
export const toClaim = (drops: TwitchDrop[], m: { redeemed: string[]; expired: string[] }, now: number) =>
  drops.filter((d) => d.endsMs > now && !m.redeemed.includes(d.key) && !m.expired.includes(d.key)).sort((a, b) => a.endsMs - b.endsMs);
