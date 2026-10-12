import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import officialToken from "./src/product/official-token.json"
import { resolveOfficialToken } from "./src/product/official-token-config"

if (resolveOfficialToken(officialToken).status === "unavailable") {
  throw new Error("Invalid official-token.json: publish only a reviewed contract address with its network and chain ID, or keep every identity field null before launch.");
}

// The API is proxied so the browser talks to a single origin in dev: no CORS
// preflight, and VITE_API_BASE_URL can stay empty. Point API_PROXY_TARGET
// somewhere else to develop against a deployed API.
const apiTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:4000";
const rawBuildSha = process.env.VITE_BUILD_SHA || process.env.RAILWAY_GIT_COMMIT_SHA;
if (rawBuildSha && !/^[0-9a-f]{40}$/i.test(rawBuildSha)) {
  throw new Error("VITE_BUILD_SHA must be a full Git commit SHA");
}
const buildSha = rawBuildSha ?? "local";
const railwayPublicUrl = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : undefined;
const publicSiteUrl = new URL(
  process.env.VITE_PUBLIC_SITE_URL || railwayPublicUrl || "http://localhost:5173",
).origin;

// https://vite.dev/config/
export default defineConfig({
  // Absolute base: the app deep-links to /app/chat/:id, and a relative base
  // would resolve asset URLs against the route path on a hard refresh.
  base: '/',
  plugins: [
    react(),
    {
      name: "opsis-deployment-metadata",
      transformIndexHtml(html) {
        return html
          .replaceAll("__OPSIS_PUBLIC_SITE_URL__", publicSiteUrl)
          .replaceAll("__OPSIS_BUILD_SHA__", buildSha);
      },
    },
  ],
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
