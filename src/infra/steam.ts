// Fetches the public Steam news feed for AION 2.
import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { parseNewsItems } from "../domain/news.ts";
import type { NewsItem } from "../domain/types.ts";

const PATH = "/ISteamNews/GetNewsForApp/v2/?appid=3393110&count=10&maxlength=0"; // 0 = full text

export async function fetchNews(): Promise<NewsItem[]> {
  // Browser preview goes through the Vite proxy (Steam sends no CORS headers).
  const res = isTauri() ? await tauriFetch("https://api.steampowered.com" + PATH) : await fetch("/steam" + PATH);
  if (!res.ok) throw new Error(`Steam news: HTTP ${res.status}`);
  return parseNewsItems(await res.json());
}
