import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { contactAddresses } from "./src/product/contact";
import { generateSiteFiles, siteOrigin } from "./build/site-files";
// The API is proxied so the browser talks to a single origin in dev: no CORS
// preflight, and VITE_API_BASE_URL can stay empty. Point API_PROXY_TARGET
// somewhere else to develop against a deployed API.
const apiTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:4000";
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  const rawBuildSha = env.VITE_BUILD_SHA || env.RAILWAY_GIT_COMMIT_SHA;
  if (rawBuildSha && !/^[0-9a-f]{40}$/i.test(rawBuildSha)) {
    throw new Error("VITE_BUILD_SHA must be a full Git commit SHA");
  }
  const buildSha = rawBuildSha ?? "local";
  const contact = contactAddresses(
    env.VITE_SUPPORT_EMAIL,
    env.VITE_SECURITY_EMAIL,
  );
  const railwayPublicUrl = env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${env.RAILWAY_PUBLIC_DOMAIN}`
    : undefined;
  const publicSiteUrl = siteOrigin(
    env.VITE_PUBLIC_SITE_URL || railwayPublicUrl || "http://localhost:5173",
  );

  // https://vite.dev/config/
  return {
    // Absolute base: the app deep-links to /app/chat/:id, and a relative base
    // would resolve asset URLs against the route path on a hard refresh.
    base: "/",
    plugins: [
      react(),
      {
        name: "opsis-site-files",
        generateBundle() {
          const files = generateSiteFiles({
            origin: publicSiteUrl,
            indexable: env.VITE_OPSIS_INDEXABLE,
            workspacesEnabled: env.VITE_OPSIS_WORKSPACES_ENABLED,
            publicAccessEnabled: env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED,
            contact,
            builtAt: new Date(),
          });
          for (const [fileName, source] of Object.entries(files)) {
            this.emitFile({ type: "asset", fileName, source });
          }
        },
      },
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
  };
});
