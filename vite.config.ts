import { readFileSync } from "node:fs";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
// Only the release build in CI has the token: it uploads the source maps to Sentry and deletes them from dist/.
const sentryToken = process.env.SENTRY_AUTH_TOKEN;

// Standard Tauri setup: fixed port, no screen clearing.
export default defineConfig({
  plugins: [
    tailwindcss(),
    svelte(),
    sentryVitePlugin({
      org: "krajetum", project: "javascript-svelte", authToken: sentryToken, disable: !sentryToken,
      release: { name: version }, // = getVersion() in the app (infra/sentry.ts)
      sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.map"] },
      telemetry: false,
    }),
  ],
  // shadcn-svelte components import from $lib.
  resolve: { alias: { $lib: fileURLToPath(new URL("./src/lib", import.meta.url)) } },
  build: { sourcemap: sentryToken ? "hidden" : false },
  clearScreen: false,
  server: {
    port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] },
    // Browser preview only: Steam's API has no CORS headers (the desktop app uses plugin-http).
    proxy: { "/steam": { target: "https://api.steampowered.com", changeOrigin: true, rewrite: (p) => p.replace(/^\/steam/, "") } },
  },
});
