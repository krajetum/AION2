// Calls the crowd Worker (server/). It sends CORS headers, so the browser preview calls it directly.
import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { CROWD_URL } from "../config.ts";

const BASE = import.meta.env.VITE_CROWD_URL || CROWD_URL;

/** A non-2xx answer: `status` lets callers tell "not a member" (403) from a network hiccup. */
export class CrowdError extends Error {
  readonly status: number;
  readonly reason: string;
  constructor(path: string, status: number, reason: string) {
    super(`Crowd ${path.split("?")[0]}: HTTP ${status} ${reason}`);
    this.status = status;
    this.reason = reason;
  }
}

/** GET without a body, POST with one; throws on network errors and non-2xx answers (CrowdError). */
export async function crowd(path: string, body?: unknown): Promise<any> {
  const init: RequestInit = body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  init.signal = AbortSignal.timeout(10_000);
  const res = isTauri() ? await tauriFetch(BASE + path, init) : await fetch(BASE + path, init);
  if (!res.ok) throw new CrowdError(path, res.status, await res.json().then((j) => String(j?.error ?? "")).catch(() => ""));
  return res.json();
}
