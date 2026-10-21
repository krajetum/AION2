// Official AION 2 announcements (incl. maintenance): Steam feed parsing and the read/unread cache. Pure.
import type { AppData, NewsItem } from "./types.ts";

/** Maintenance / server notices: shown as a banner until read. */
export const isImportant = (n: NewsItem) => /maint|outage|downtime|emergency/i.test(n.title);

/** Steam GetNewsForApp JSON → news items with plain-text contents. */
export function parseNewsItems(json: any): NewsItem[] {
  const items: any[] = json?.appnews?.newsitems ?? [];
  return items.map((n) => ({
    gid: String(n.gid), title: String(n.title), url: String(n.url), date: +n.date,
    // BBCode/HTML → plain text; paragraph and list breaks become \n (shown with white-space: pre-line).
    // Table rows → "a | b | c" lines.
    contents: String(n.contents ?? "")
      .replace(/\[\/p\](?=\s*\[\/t[dh]\])|(?<=\[t[dh][^\]]*\])\s*\[p\]/gi, "")
      .replace(/\[\/t[dh]\]\s*\[t[dh][^\]]*\]/gi, " | ")
      .replace(/<br\s*\/?>|<\/(p|li|h\d)>|\[\/?(p|h\d|list|tr)\]|\[\*\]|\[br\]/gi, "\n")
      .replace(/\[[^\]]*\]|<[^>]*>/g, " ")
      .replace(/[^\S\n]+/g, " ").replace(/ *\n\s*/g, "\n").trim(),
  }));
}

/** Replaces the cached list (keeping read flags). Returns items newer than the last seen one;
 *  none on the very first fetch, so a fresh install doesn't toast 10 old posts. */
export function mergeNews(data: AppData, items: NewsItem[]): NewsItem[] {
  if (!items.length) return [];
  const read = new Set(data.news.filter((n) => n.read).map((n) => n.gid));
  const first = !data.lastNewsGid;
  const idx = items.findIndex((n) => n.gid === data.lastNewsGid);
  const fresh = first ? [] : items.slice(0, idx < 0 ? items.length : idx);
  // First fetch: everything read except notices from the last 3 days.
  const recent = (n: NewsItem) => isImportant(n) && Date.now() / 1000 - n.date < 3 * 86400;
  data.news = items.map((n) => ({ ...n, read: first ? !recent(n) : read.has(n.gid) }));
  data.lastNewsGid = items[0].gid;
  return fresh;
}
