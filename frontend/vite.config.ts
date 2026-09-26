import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

/** Where `npm run dev` sends /api (override with API_PROXY=http://localhost:8091). */
const API = process.env.API_PROXY ?? "http://localhost:8080";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": API,
      "/healthz": API,
    },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
  },
});
