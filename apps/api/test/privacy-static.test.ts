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
