import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the built site works from GitHub Pages AND when served by
// `luno serve` (once `web/dist` exists) — no absolute paths required.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    host: true,
    // Local dev: forward API calls to the local Luno server.
    proxy: {
      "/v1": "http://127.0.0.1:8787",
      "/health": "http://127.0.0.1:8787",
    },
  },
  preview: {
    port: 4173,
    host: true,
    proxy: {
      "/v1": "http://127.0.0.1:8787",
      "/health": "http://127.0.0.1:8787",
    },
  },
});
