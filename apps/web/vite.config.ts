import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The API is proxied so the browser talks to a single origin in dev: no CORS
// preflight, and VITE_API_BASE_URL can stay empty. Point API_PROXY_TARGET
// somewhere else to develop against a deployed API.
const apiTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:4000";

// https://vite.dev/config/
export default defineConfig({
  // Absolute base: the app deep-links to /app/chat/:id, and a relative base
  // would resolve asset URLs against the route path on a hard refresh.
  base: '/',
  plugins: [react()],
  server: {
    port: Number(process.env.PORT ?? 5173),
    proxy: {
      "/v1": { target: apiTarget, changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
