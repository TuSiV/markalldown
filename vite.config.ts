import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

import { VitePWA } from "vite-plugin-pwa";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(({ mode }) => ({
  publicDir: mode === "web" ? "public-web" : "public",
  plugins: [react(), tailwindcss(), ...(mode === "web" ? [VitePWA({
    strategies: "injectManifest", srcDir: "src/web", filename: "sw.ts",
    registerType: "autoUpdate", injectRegister: "auto",
    manifest: { name: "MarkAllDown 本地文档工作台", short_name: "MarkAllDown", start_url: ".", display: "standalone", theme_color: "#2b63ac", background_color: "#f3f6fa", icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml" }] },
    injectManifest: { globPatterns: ["**/*.{js,mjs,css,html,wasm,png,json,txt}"], globIgnores: ["ocr/**", "pdf/**"], maximumFileSizeToCacheInBytes: 10_000_000 },
  })] : [])],
  worker: { format: "es" },
  build: { emptyOutDir: true },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  optimizeDeps: {
    include: ["tslib"],
  },
}));
