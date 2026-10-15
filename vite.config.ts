import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the built site works anywhere for free:
// GitHub Pages, Netlify, Vercel, or any static folder — no server required.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: true,
  },
});
