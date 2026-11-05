import { readFileSync } from "node:fs";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
// Only the release build in CI has the token: it uploads the source maps to Sentry and deletes them from dist/.
const sentryToken = process.env.SENTRY_AUTH_TOKEN;

// Standard Tauri setup: fixed port, no screen clearing.
export default defineConfig({
  plugins: [
    svelte(),
    sentryVitePlugin({
      org: "krajetum", project: "javascript-svelte", authToken: sentryToken, disable: !sentryToken,
      release: { name: version }, // = getVersion() in the app (infra/sentry.ts)
      sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.map"] },
      telemetry: false,
    }),
  ],
  build: { sourcemap: sentryToken ? "hidden" : false },
  clearScreen: false,
  server: {
    port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] },
    // Browser preview only: Steam's API has no CORS headers (the desktop app uses plugin-http).
    proxy: { "/steam": { target: "https://api.steampowered.com", changeOrigin: true, rewrite: (p) => p.replace(/^\/steam/, "") } },
  },
});
