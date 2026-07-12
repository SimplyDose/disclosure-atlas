import { defineConfig } from "vite";

// Static build. Relative base so the dist/ folder can be served from any path/CDN.
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
});
