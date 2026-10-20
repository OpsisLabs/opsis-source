import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const nginx = readFileSync(
  new URL("../../../nginx.conf", import.meta.url),
  "utf8",
);
describe("SQL production asset serving", () => {
  it("changes only WASM compilation and self workers in both CSPs", () => {
    const headers = [
      ...nginx.matchAll(
        /add_header Content-Security-Policy "([^"\n]+)" always;/g,
      ),
    ].map((m) => m[1]);
    expect(headers).toHaveLength(2);
    for (const [i, header] of headers.entries())
      expect(header).toBe(
        `default-src 'self'; base-uri 'self'; connect-src 'self' https://rpc.mainnet.chain.robinhood.com https://assets.tcgdex.net; font-src 'self' data:; form-action 'self'; frame-ancestors '${i ? "self" : "none"}'; img-src 'self' data:; object-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests`,
      );
  });
  it("serves WASM with its MIME, compresses engine and text assets, retains security headers with immutable caching", () => {
    expect(nginx).toContain("include /etc/nginx/mime.types;");
    expect(nginx).not.toContain("types { application/wasm wasm; }");
    expect(nginx).toContain("include /etc/nginx/mime.types;");
    expect(nginx).toContain("gzip on;");
    expect(nginx).toContain("gzip_min_length 1024;");
    expect(nginx).toContain(
      "gzip_types application/wasm application/javascript text/javascript text/css application/json;",
    );
    expect(nginx).toContain("gzip_vary on;");
    expect(nginx).toContain('"public, max-age=31536000, immutable"');
    expect(nginx).toContain("add_header Cache-Control $opsis_asset_cache;");
    const location = nginx.match(/location ~ "\^\/assets\/[^}]+}[^}]+}/)?.[0];
    expect(location).toContain("try_files $uri =404;");
    expect(location).not.toContain("add_header");
  });
});
