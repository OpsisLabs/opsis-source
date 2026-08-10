import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

describe("browser privacy static boundary", () => {
  it("does not persist or serialize browser credentials", () => {
    const webSource = sourceText(resolve(repositoryRoot, "apps/web/src"));
    expect(webSource).not.toMatch(/localStorage\.(?:getItem|setItem)\s*\(/);
    expect(webSource).not.toMatch(/sessionStorage\.(?:getItem|setItem)\s*\(/);
    expect(webSource).not.toMatch(/authorization\s*["'`\]]*\s*[:,]\s*[`"']Bearer/i);
    expect(webSource).not.toContain("accessToken:");
    expect(webSource).not.toContain("refreshToken:");
    // The only legacy-storage operation is a blind removal at startup.
    expect((webSource.match(/localStorage\.removeItem\("rh_auth"\)/g) ?? [])).toHaveLength(1);
  });

  it("contains no passive Google font or tracker request", () => {
    const index = readFileSync(resolve(repositoryRoot, "apps/web/index.html"), "utf8");
    const nginx = readFileSync(resolve(repositoryRoot, "apps/web/nginx.conf"), "utf8");
    const combined = `${index}\n${nginx}`;
    expect(combined).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/i);
    expect(combined).not.toMatch(/google-analytics|googletagmanager|segment\.com|posthog/i);
    expect(nginx).toContain("connect-src 'self'");
    expect(nginx).not.toContain("https://*.up.railway.app");
  });

  it("keeps the same-origin API proxy host and port runtime-configurable", () => {
    const nginx = readFileSync(resolve(repositoryRoot, "apps/web/nginx.conf"), "utf8");
    const dockerfile = readFileSync(resolve(repositoryRoot, "apps/web/Dockerfile"), "utf8");
    const server = readFileSync(resolve(repositoryRoot, "apps/api/src/server.ts"), "utf8");
    expect(nginx).toContain("proxy_pass ${API_UPSTREAM_SCHEME}://${API_UPSTREAM_HOST}:${API_UPSTREAM_PORT}");
    expect(nginx).toContain("proxy_ssl_name ${API_UPSTREAM_HOST}");
    expect(nginx).toContain("proxy_ssl_verify on");
    expect(nginx).toContain("proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt");
    expect(nginx).toContain("proxy_set_header Host ${API_UPSTREAM_HOST}");
    expect(nginx).toContain("proxy_set_header X-Forwarded-Host $host");
    expect(dockerfile).toContain("ENV API_UPSTREAM_SCHEME=http");
    expect(dockerfile).toContain("ENV API_UPSTREAM_HOST=api.railway.internal");
    expect(dockerfile).toContain("ENV API_UPSTREAM_PORT=4000");
    expect(dockerfile).toContain("ENV NGINX_ENVSUBST_FILTER=API_UPSTREAM_SCHEME|API_UPSTREAM_HOST|API_UPSTREAM_PORT");
    expect(dockerfile).toContain("RUN apk add --no-cache ca-certificates");
    expect(server).toContain('host: "::"');
  });

  it("keeps the default private route outside auth and wallet providers", () => {
    const app = readFileSync(resolve(repositoryRoot, "apps/web/src/App.tsx"), "utf8");
    expect(app).toContain('<Route path="/app" element={<PrivateExplorer />} />');
    expect(app.indexOf('<Route path="/app" element={<PrivateExplorer />} />')).toBeLessThan(app.indexOf('<Route element={<CloudProviders />}>'));
  });
});

function sourceText(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return sourceText(path);
      if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name) || !statSync(path).isFile()) return "";
      return readFileSync(path, "utf8");
    })
    .join("\n");
}
