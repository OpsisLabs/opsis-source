import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../web/public/quant/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("publication.json", root), "utf8")) as { publicationSha: string; quantHashes: Record<string, string> };

describe("published Crypto Quant Lab preservation", () => {
  it("retains every published file byte-for-byte under its original digest", () => {
    expect(manifest.publicationSha).toBe("90dcbe698aaf407ccf3658436b3e3df44e412349");
    expect(Object.keys(manifest.quantHashes)).toHaveLength(15);
    for (const [file, hash] of Object.entries(manifest.quantHashes)) {
      expect(file).toMatch(/^(?:assets\/[a-z]+\.svg|app\.js|style\.css|index\.html|crypto-data\.json)$/);
      expect(createHash("sha256").update(readFileSync(new URL(file, root))).digest("hex")).toBe(hash);
    }
  });
  it("preserves a dated public snapshot rather than silently calling it a live market feed", () => {
    const data = JSON.parse(readFileSync(new URL("crypto-data.json", root), "utf8"));
    expect(data.chainId).toBe(4663);
    expect(data.tokens).toHaveLength(10);
    expect(Number.isFinite(Date.parse(data.capturedAt))).toBe(true);
    const app = readFileSync(new URL("app.js", root), "utf8");
    expect(app).toContain('fetch("crypto-data.json")');
    expect(app).toContain("captured snapshot, not a continuously refreshed feed");
    expect(app).not.toMatch(/\b(?:localStorage|sessionStorage|indexedDB)\b|document\.cookie|window\.ethereum/);
  });
  it("isolates the static route and keeps missing assets out of the SPA fallback", () => {
    const nginx = readFileSync(new URL("../../web/nginx.conf", import.meta.url), "utf8");
    expect(nginx).toContain("return 308 /quant/;");
    expect(nginx).toMatch(/location \^~ \/quant\/\s*\{\s*try_files \$uri \$uri\/ =404;/);
    expect(nginx).toContain("script-src 'self'");
  });
});
