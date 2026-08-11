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
    expect(dockerfile).toContain("COPY packages/shared/package.json packages/shared/package.json");
    expect(dockerfile).toContain("COPY packages/shared packages/shared");
    expect(dockerfile).toContain("RUN pnpm --filter @rh-chain/shared build && pnpm --filter @rh-chain/web build");
    expect(server).toContain('host: "::"');
  });

  it("keeps schema-owner credentials out of the runtime deployment", () => {
    const railway = readFileSync(resolve(repositoryRoot, "apps/api/railway.json"), "utf8");
    const dockerfile = readFileSync(resolve(repositoryRoot, "apps/api/Dockerfile"), "utf8");
    const envExample = readFileSync(resolve(repositoryRoot, ".env.example"), "utf8");
    expect(JSON.parse(railway).deploy.preDeployCommand).toBe(
      "node /app/apps/api/dist/ops/verify-deployment-schema.js"
    );
    expect(railway).not.toContain("migrate deploy");
    expect(railway).not.toContain("DIRECT_URL");
    expect(dockerfile).toContain("COPY --from=build /app/apps/api/dist apps/api/dist");
    expect(envExample).not.toContain("DIRECT_URL=");
  });

  it("keeps the default private route outside auth and wallet providers", () => {
    const app = readFileSync(resolve(repositoryRoot, "apps/web/src/App.tsx"), "utf8");
    expect(app).toContain('<Route path="/app" element={<PrivateExplorer />} />');
    expect(app).toContain('<Route path="/vault" element={<VaultPage />} />');
    expect(app.indexOf('<Route path="/app" element={<PrivateExplorer />} />')).toBeLessThan(app.indexOf('<Route element={<CloudProviders />}>'));
    expect(app.indexOf('<Route path="/vault" element={<VaultPage />} />')).toBeLessThan(app.indexOf('<Route element={<CloudProviders />}>'));
  });

  it("keeps vault plaintext and local cryptography outside every network and weak-storage API", () => {
    const vaultSource = sourceText(resolve(repositoryRoot, "apps/web/src/vault"))
      + readFileSync(resolve(repositoryRoot, "apps/web/src/pages/Vault.tsx"), "utf8");
    expect(vaultSource).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
    expect(vaultSource).not.toMatch(/localStorage|sessionStorage|\bcaches\.|CacheStorage/);
    expect(vaultSource).not.toMatch(/dangerouslySetInnerHTML|http:\/\/|https:\/\//);
    const nginx = readFileSync(resolve(repositoryRoot, "apps/web/nginx.conf"), "utf8");
    expect(nginx).toContain("img-src 'self' data:");
    expect(nginx).not.toContain("img-src 'self' data: https:");
  });

  it("limits portfolio networking to one public address and keeps Vault context out of the API module", () => {
    const portfolioDirectory = resolve(repositoryRoot, "apps/web/src/portfolio");
    const portfolioSource = sourceText(portfolioDirectory);
    const apiSource = readFileSync(resolve(portfolioDirectory, "api.ts"), "utf8");
    const panelSource = readFileSync(resolve(portfolioDirectory, "PortfolioPanel.tsx"), "utf8");
    expect(apiSource).toContain('privateApi<PortfolioSnapshot>("/v1/private/portfolio/snapshot", { address }, signal)');
    expect(panelSource).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
    expect(portfolioSource).not.toMatch(/localStorage|sessionStorage|IndexedDB|indexedDB|dangerouslySetInnerHTML/);
    expect(apiSource).not.toMatch(/label|valuation|unitPrice|purchase|lots|notes|photo|vaultId|passphrase/i);
    expect(portfolioSource).not.toMatch(/eth_requestAccounts|eth_accounts|personal_sign|sendTransaction/);
  });

  it("disables automatic provider retries for budgeted portfolio fan-out", () => {
    const source = readFileSync(resolve(repositoryRoot, "apps/api/src/portfolio/service.ts"), "utf8");
    expect(source).toContain("PROVIDER_MAX_RETRIES: 0");
    expect(source).toContain('createProviderHttp(oneAttemptEnv, "robinhood-public-rpc")');
    expect(source).toContain('createProviderHttp(oneAttemptEnv, "blockscout")');
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
