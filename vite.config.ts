import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// The PWA is served same-origin behind the shared VPS Nginx, which proxies
// `/api` and `/ws` to the Go relay. In local dev there is no Nginx, so we proxy
// those two prefixes to a relay running on :8080 (see CLAUDE.md). This keeps all
// app code using relative URLs (`/api/...`, `/ws?token=...`) in every environment.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src/sw",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: null, // we register manually in main.tsx via virtual:pwa-register
      injectManifest: {
        // Precache the app shell so the Receive view opens offline-fast when a
        // push lands; runtime data (OTP claims) is never cached.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
      },
      manifest: {
        name: "OTP Relay",
        short_name: "OTP",
        description: "Self-hosted, end-to-end encrypted OTP relay receiver.",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
