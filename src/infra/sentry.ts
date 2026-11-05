// Sentry, only while settings.crashReports is on (off by default) and a DSN is set (config.ts): errors, tracing,
// session replay (all text, inputs and images masked) and console warnings/errors as logs. No user data.
// The SDK is loaded only when turned on. The Rust side reports on its own (src-tauri/src/telemetry.rs).
import { isTauri } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { SENTRY_DSN } from "../config.ts";

const DSN = import.meta.env.VITE_SENTRY_DSN || SENTRY_DSN;
let sentry: typeof import("@sentry/svelte") | undefined;

/** Starts or stops the reports. Returns whether they are on. */
export async function crashReports(on: boolean): Promise<boolean> {
  if (!on || !DSN) {
    await sentry?.close();
    sentry = undefined;
    return false;
  }
  if (sentry) return true;
  const S = await import("@sentry/svelte");
  S.init({
    dsn: DSN,
    release: isTauri() ? await getVersion() : "dev",
    environment: import.meta.env.DEV ? "development" : "production",
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    integrations: [
      S.browserTracingIntegration(),
      S.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true }),
      S.consoleLoggingIntegration({ levels: ["warn", "error"] }),
    ],
    tracesSampleRate: 1,
    tracePropagationTargets: [], // no trace headers on Steam or the crowd Worker (CORS)
    // ponytail: free plan = 50 replays a month; lower the session rate if more players turn reports on.
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
  });
  sentry = S;
  return true;
}
