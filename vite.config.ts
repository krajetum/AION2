import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// Standard Tauri setup: fixed port, no screen clearing.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] },
    // Browser preview only: Steam's API has no CORS headers (the desktop app uses plugin-http).
    proxy: { "/steam": { target: "https://api.steampowered.com", changeOrigin: true, rewrite: (p) => p.replace(/^\/steam/, "") } },
  },
});
