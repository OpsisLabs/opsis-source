import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

describe("browser privacy static boundary", () => {
  it("does not persist or serialize browser credentials", () => {
    const webSource = sourceText(resolve(repositoryRoot, "apps/web/src"));
    expect(webSource).not.toMatch(/localStorage\.(?:getItem|setItem)\s*\(/);
    expect(webSource).not.toMatch(/sessionStorage\.(?:getItem|setItem)\s*\(/);
    expect(webSource).not.toMatch(
      /authorization\s*["'`\]]*\s*[:,]\s*[`"']Bearer/i,
    );
    expect(webSource).not.toContain("accessToken:");
    expect(webSource).not.toContain("refreshToken:");
    // The only legacy-storage operation is a blind removal at startup.
    expect(
      webSource.match(/localStorage\.removeItem\("rh_auth"\)/g) ?? [],
    ).toHaveLength(1);
    expect(webSource).toContain(
      'const TOUR_COOKIE = "chainscout_product_tour_seen_v1"',
    );
    expect(webSource).toContain(
      "Max-Age=31536000; Path=/; SameSite=Strict",
    );
    expect(webSource).not.toMatch(
      /document\.cookie\s*=.*(?:address|wallet|asset|holding|price|note|vault)/i,
    );
  });

  it("contains no passive Google font or tracker request", () => {
    const index = readFileSync(
      resolve(repositoryRoot, "apps/web/index.html"),
      "utf8",
    );
    const nginx = readFileSync(
      resolve(repositoryRoot, "apps/web/nginx.conf"),
      "utf8",
    );
    const combined = `${index}\n${nginx}`;
    expect(combined).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/i);
    expect(combined).not.toMatch(
      /google-analytics|googletagmanager|segment\.com|posthog/i,
    );
    expect(nginx).toContain("connect-src 'self'");
    expect(nginx).not.toContain("https://*.up.railway.app");
  });

  it("keeps the same-origin API proxy host and port runtime-configurable", () => {
    const nginx = readFileSync(
      resolve(repositoryRoot, "apps/web/nginx.conf"),
      "utf8",
    );
    const dockerfile = readFileSync(
      resolve(repositoryRoot, "apps/web/Dockerfile"),
      "utf8",
    );
    const server = readFileSync(
      resolve(repositoryRoot, "apps/api/src/server.ts"),
      "utf8",
    );
    expect(nginx).toContain(
      "proxy_pass ${API_UPSTREAM_SCHEME}://${API_UPSTREAM_HOST}:${API_UPSTREAM_PORT}",
    );
    expect(nginx).toContain("proxy_ssl_name ${API_UPSTREAM_HOST}");
    expect(nginx).toContain("proxy_ssl_verify on");
    expect(nginx).toContain(
      "proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt",
    );
    expect(nginx).toContain("proxy_set_header Host ${API_UPSTREAM_HOST}");
    expect(nginx).toContain("proxy_set_header X-Forwarded-Host $host");
    expect(dockerfile).toContain("ENV API_UPSTREAM_SCHEME=http");
    expect(dockerfile).toContain("ENV API_UPSTREAM_HOST=api.railway.internal");
    expect(dockerfile).toContain("ENV API_UPSTREAM_PORT=4000");
    expect(dockerfile).toContain(
      "ENV NGINX_ENVSUBST_FILTER=API_UPSTREAM_SCHEME|API_UPSTREAM_HOST|API_UPSTREAM_PORT",
    );
    expect(dockerfile).toContain("RUN apk add --no-cache ca-certificates");
    expect(dockerfile).toContain(
      "COPY packages/shared/package.json packages/shared/package.json",
    );
    expect(dockerfile).toContain("COPY packages/shared packages/shared");
    expect(dockerfile).toContain(
      "RUN pnpm --filter @rh-chain/shared build && pnpm --filter @rh-chain/web build",
    );
    expect(server).toContain('host: "::"');
  });

  it("keeps schema-owner credentials out of the runtime deployment", () => {
    const railway = readFileSync(
      resolve(repositoryRoot, "apps/api/railway.json"),
      "utf8",
    );
    const dockerfile = readFileSync(
      resolve(repositoryRoot, "apps/api/Dockerfile"),
      "utf8",
    );
    const envExample = readFileSync(
      resolve(repositoryRoot, ".env.example"),
      "utf8",
    );
    expect(JSON.parse(railway).deploy.preDeployCommand).toBe(
      "node /app/apps/api/dist/ops/verify-deployment-schema.js",
    );
    expect(railway).not.toContain("migrate deploy");
    expect(railway).not.toContain("DIRECT_URL");
    expect(dockerfile).toContain(
      "COPY --from=build /app/apps/api/dist apps/api/dist",
    );
    expect(envExample).not.toContain("DIRECT_URL=");
  });

  it("keeps the default private route outside auth and wallet providers", () => {
    const app = readFileSync(
      resolve(repositoryRoot, "apps/web/src/App.tsx"),
      "utf8",
    );
    expect(app).toContain(
      '<Route path="/app" element={<PrivateExplorer />} />',
    );
    expect(app).toContain('<Route path="/vault" element={<VaultPage />} />');
    expect(app).toContain('<Route path="/rwa" element={<RwaVerify />} />');
    expect(
      app.indexOf('<Route path="/app" element={<PrivateExplorer />} />'),
    ).toBeLessThan(app.indexOf("<Route element={<CloudProviders />}>"));
    expect(
      app.indexOf('<Route path="/vault" element={<VaultPage />} />'),
    ).toBeLessThan(app.indexOf("<Route element={<CloudProviders />}>"));
    expect(
      app.indexOf('<Route path="/rwa" element={<RwaVerify />} />'),
    ).toBeLessThan(app.indexOf("<Route element={<CloudProviders />}>"));
  });

  it("keeps vault plaintext and local cryptography outside every network and weak-storage API", () => {
    const vaultSource =
      sourceText(resolve(repositoryRoot, "apps/web/src/vault")) +
      readFileSync(
        resolve(repositoryRoot, "apps/web/src/pages/Vault.tsx"),
        "utf8",
      );
    expect(vaultSource).not.toMatch(
      /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/,
    );
    expect(vaultSource).not.toMatch(
      /localStorage|sessionStorage|\bcaches\.|CacheStorage/,
    );
    expect(vaultSource).not.toMatch(/dangerouslySetInnerHTML|http:\/\//);
    const nginx = readFileSync(
      resolve(repositoryRoot, "apps/web/nginx.conf"),
      "utf8",
    );
    expect(nginx).toContain("img-src 'self' data:");
    expect(nginx).not.toContain("img-src 'self' data: https:");
  });

  it("limits portfolio networking to one public address and keeps Vault context out of the API module", () => {
    const portfolioDirectory = resolve(
      repositoryRoot,
      "apps/web/src/portfolio",
    );
    const portfolioSource = sourceText(portfolioDirectory);
    const apiSource = readFileSync(
      resolve(portfolioDirectory, "api.ts"),
      "utf8",
    );
    const panelSource = readFileSync(
      resolve(portfolioDirectory, "PortfolioPanel.tsx"),
      "utf8",
    );
    expect(apiSource).toContain(
      'privateApi<PortfolioSnapshot>("/v1/private/portfolio/snapshot", { address }, signal)',
    );
    expect(panelSource).not.toMatch(
      /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/,
    );
    expect(portfolioSource).not.toMatch(
      /localStorage|sessionStorage|IndexedDB|indexedDB|dangerouslySetInnerHTML/,
    );
    expect(apiSource).not.toMatch(
      /label|valuation|unitPrice|purchase|lots|notes|photo|vaultId|passphrase/i,
    );
    expect(portfolioSource).not.toMatch(
      /eth_requestAccounts|eth_accounts|personal_sign|sendTransaction/,
    );
  });

  it("disables automatic provider retries for budgeted portfolio fan-out", () => {
    const source = readFileSync(
      resolve(repositoryRoot, "apps/api/src/portfolio/service.ts"),
      "utf8",
    );
    expect(source).toContain("PROVIDER_MAX_RETRIES: 0");
    expect(source).toContain(
      'createProviderHttp(oneAttemptEnv, "robinhood-public-rpc")',
    );
    expect(source).toContain('createProviderHttp(oneAttemptEnv, "blockscout")');
  });

  it("limits RWA networking to one public address with no weak storage or wallet path", () => {
    const directory = resolve(repositoryRoot, "apps/web/src/rwa");
    const source = sourceText(directory);
    const api = readFileSync(resolve(directory, "api.ts"), "utf8");
    const page = readFileSync(
      resolve(repositoryRoot, "apps/web/src/pages/RwaVerify.tsx"),
      "utf8",
    );
    expect(api).toContain(
      'privateApi("/v1/private/rwa/verify", { address }, signal)',
    );
    expect(source + page).not.toMatch(
      /localStorage|sessionStorage|IndexedDB|indexedDB|dangerouslySetInnerHTML/,
    );
    expect(source + page).not.toMatch(
      /eth_requestAccounts|eth_accounts|personal_sign|sendTransaction/,
    );
    expect(page).not.toMatch(
      /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/,
    );
    expect(api.slice(api.indexOf("export function verifyRwa"))).not.toMatch(
      /label|valuation|purchase|lots|notes|photo|vaultId|passphrase/i,
    );
  });

  it("disables provider retries and uses fixed official evidence hosts for RWA verification", () => {
    const source = readFileSync(
      resolve(repositoryRoot, "apps/api/src/rwa/service.ts"),
      "utf8",
    );
    expect(source).toContain("PROVIDER_MAX_RETRIES: 0");
    expect(source).toContain('const RHJ_API = "https://api.robinhood.com/rhj"');
    expect(source).toContain(
      'const CHAINLINK_RDD = "https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json"',
    );
    expect(source).toContain('const MORPHO_API = "https://api.morpho.org"');
    expect(source).toContain('redirect: "error"');
    expect(source).not.toMatch(
      /Prisma|OpenAI|ChatRepository|persistResolution/,
    );
  });

  it("keeps collectible lookups metadata-only and ownership fields outside the network module", () => {
    const directory = resolve(repositoryRoot, "apps/web/src/collectibles");
    const source = sourceText(directory);
    const api = readFileSync(resolve(directory, "api.ts"), "utf8");
    const panel = readFileSync(
      resolve(directory, "CollectibleCatalogPanel.tsx"),
      "utf8",
    );
    expect(api).toContain(
      'privateApi<CollectibleSearchResponse>("/v1/private/collectibles/search", input, signal)',
    );
    expect(api).toContain(
      'privateApi<CollectibleDetailResponse>("/v1/private/collectibles/detail", { language, cardId }, signal)',
    );
    expect(api).not.toMatch(
      /condition|grade|certificate|photo|unitPrice|purchase|notes|referenceValue|passphrase|vaultId/i,
    );
    expect(panel).not.toMatch(
      /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/,
    );
    expect(panel.indexOf("abortRef.current = controller")).toBeGreaterThan(-1);
    expect(panel.indexOf("abortRef.current = controller")).toBeLessThan(
      panel.indexOf("await persistReceipt(receipt)"),
    );
    expect(panel).toContain("createPortal(");
    expect(panel).toContain('root?.setAttribute("inert", "")');
    expect(source).not.toMatch(
      /localStorage|sessionStorage|dangerouslySetInnerHTML|eth_requestAccounts|personal_sign|sendTransaction/,
    );

    const service = readFileSync(
      resolve(repositoryRoot, "apps/api/src/collectibles/service.ts"),
      "utf8",
    );
    const searchQuery =
      service.match(/const SEARCH_QUERY = `([\s\S]*?)`;/)?.[1] ?? "";
    const detailQuery =
      service.match(/const DETAIL_QUERY = `([\s\S]*?)`;/)?.[1] ?? "";
    expect(service).toContain("PROVIDER_MAX_RETRIES: 0");
    expect(service).toContain("}/graphql`, {");
    expect(service).toContain('method: "POST"');
    expect(service).toContain('redirect: "error"');
    expect(searchQuery).toContain("cards(filters:");
    expect(detailQuery).toContain("card(id:");
    expect(searchQuery + detailQuery).not.toMatch(
      /image|logo|symbol|pricing|thirdParty|variant/i,
    );
    expect(service).not.toMatch(
      /Prisma|OpenAI|ChatRepository|persistResolution/,
    );
    expect(service).not.toMatch(/\.\.\.value|\.\.\.body|\.\.\.candidate/);

    const vaultPage = readFileSync(
      resolve(repositoryRoot, "apps/web/src/pages/Vault.tsx"),
      "utf8",
    );
    const envExample = readFileSync(
      resolve(repositoryRoot, ".env.example"),
      "utf8",
    );
    expect(vaultPage).toContain(
      'import.meta.env.VITE_COLLECTIBLE_CATALOG_ENABLED === "true"',
    );
    expect(vaultPage).toMatch(/COLLECTIBLE_CATALOG_ENABLED && \(\s*<button/);
    expect(envExample).toContain("VITE_COLLECTIBLE_CATALOG_ENABLED=false");
    const webDockerfile = readFileSync(
      resolve(repositoryRoot, "apps/web/Dockerfile"),
      "utf8",
    );
    expect(webDockerfile).toContain(
      "ARG VITE_COLLECTIBLE_CATALOG_ENABLED=false",
    );
    expect(webDockerfile).toContain(
      "ENV VITE_COLLECTIBLE_CATALOG_ENABLED=$VITE_COLLECTIBLE_CATALOG_ENABLED",
    );
  });

  it("keeps Market & Inventory requests public-only and private costs inside the encrypted Vault", () => {
    const directory = resolve(repositoryRoot, "apps/web/src/market");
    const source = sourceText(directory);
    const api = readFileSync(resolve(directory, "api.ts"), "utf8");
    const panel = readFileSync(
      resolve(directory, "MarketInventoryPanel.tsx"),
      "utf8",
    );
    const service = readFileSync(
      resolve(repositoryRoot, "apps/api/src/market/service.ts"),
      "utf8",
    );
    const merchants = readFileSync(
      resolve(repositoryRoot, "apps/api/src/market/merchants.ts"),
      "utf8",
    );
    const vaultPage = readFileSync(
      resolve(repositoryRoot, "apps/web/src/pages/Vault.tsx"),
      "utf8",
    );
    const webDockerfile = readFileSync(
      resolve(repositoryRoot, "apps/web/Dockerfile"),
      "utf8",
    );
    const envExample = readFileSync(
      resolve(repositoryRoot, ".env.example"),
      "utf8",
    );

    expect(api).toContain('"/v1/private/market/crypto"');
    expect(api).toContain("{ chainId: 4663, contract }");
    expect(api).toContain('"/v1/private/market/merchant"');
    for (const field of [
      "merchantId",
      "canonicalAssetId",
      "expectedSku",
      "expectedProductId",
      "expectedMappingReviewedAt",
    ]) {
      expect(api).toContain(field);
    }
    expect(api).toContain('"/v1/private/market/merchants"');
    expect(api).not.toMatch(
      /label|lot|purchase|shipping|tax|duty|fees|discount|condition|region|notes|photo|vaultId|passphrase/i,
    );
    expect(panel).not.toMatch(
      /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/,
    );
    expect(source).not.toMatch(
      /localStorage|sessionStorage|dangerouslySetInnerHTML|eth_requestAccounts|personal_sign|sendTransaction/,
    );
    expect(service).toContain("PROVIDER_MAX_RETRIES: 0");
    expect(service).toContain(
      'const DEX_API_ORIGIN = "https://api.dexscreener.com"',
    );
    expect(service).toContain('redirect: "error"');
    expect(service).not.toMatch(
      /Prisma|OpenAI|ChatRepository|persistResolution|JsonCache/,
    );
    expect(merchants).toContain("APPROVED_MARKET_MERCHANTS");
    expect(merchants).not.toMatch(/process\.env|request|query|URLSearchParams/);
    expect(vaultPage).toContain(
      'import.meta.env.VITE_MARKET_INVENTORY_ENABLED === "true"',
    );
    expect(vaultPage).toMatch(/MARKET_INVENTORY_ENABLED && \(\s*<button/);
    expect(webDockerfile).toContain("ARG VITE_MARKET_INVENTORY_ENABLED=false");
    expect(webDockerfile).toContain(
      "ENV VITE_MARKET_INVENTORY_ENABLED=$VITE_MARKET_INVENTORY_ENABLED",
    );
    expect(envExample).toContain("MARKET_INVENTORY_ENABLED=false");
    expect(envExample).toContain("VITE_MARKET_INVENTORY_ENABLED=false");
  });

  it("keeps launch marketing aligned with the anchored zero-cost provider path", () => {
    const marketing = sourceText(
      resolve(repositoryRoot, "apps/web/src/sections"),
    );
    expect(marketing).not.toMatch(/finalized block/i);
    expect(marketing).not.toMatch(/\balchemy\b|\bgoldrush\b/i);
    expect(marketing).not.toMatch(/12,408|98\.4%|99\.95%|3\.2s|86%|14%/);
    expect(marketing).not.toContain(
      "Provider failure leaves the prior local snapshot unchanged",
    );
    expect(marketing).toContain("Robinhood Public RPC");
    expect(marketing).toContain("captured current block");
    expect(marketing).toContain("partial provider results are visibly marked");
  });

  it("discloses every class of public identifier derived for direct portfolio verification", () => {
    const disclosure = [
      readFileSync(
        resolve(repositoryRoot, "apps/api/src/portfolio/service.ts"),
        "utf8",
      ),
      readFileSync(
        resolve(repositoryRoot, "apps/web/src/portfolio/PortfolioPanel.tsx"),
        "utf8",
      ),
      readFileSync(
        resolve(repositoryRoot, "apps/web/src/pages/Legal.tsx"),
        "utf8",
      ),
    ].join("\n");
    for (const identifier of [
      "contract",
      "transaction",
      "token ID",
      "spender",
      "operator",
    ]) {
      expect(disclosure).toContain(identifier);
    }
    expect(disclosure).not.toContain(
      "contract and transaction identifiers needed",
    );
  });
});

function sourceText(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return sourceText(path);
      if (
        !entry.isFile() ||
        !/\.(?:ts|tsx)$/.test(entry.name) ||
        !statSync(path).isFile()
      )
        return "";
      return readFileSync(path, "utf8");
    })
    .join("\n");
}
