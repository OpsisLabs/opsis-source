import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contactAddresses } from "../src/product/contact";
import { generateSiteFiles, PUBLIC_PAGE_PATHS, siteOrigin } from "./site-files";

const settings = {
  origin: "https://opsis.example",
  indexable: "true",
  workspacesEnabled: "true",
  publicAccessEnabled: "true",
  contact: null,
  builtAt: new Date("2026-10-12T23:40:00.123Z"),
};

describe("public build files", () => {
  it("indexes the thirteen public pages when indexing is switched on", () => {
      const files = generateSiteFiles(settings);
      expect(files["robots.txt"]).toBe(
        "User-agent: *\nAllow: /\nSitemap: https://opsis.example/sitemap.xml\n",
      );
      expect(files["sitemap.xml"]).toContain(
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      );
      expect(files["sitemap.xml"].match(/<loc>(.*?)<\/loc>/g)).toEqual(
        PUBLIC_PAGE_PATHS.map(
          (path) => `<loc>https://opsis.example${path}</loc>`,
        ),
      );
      expect(files["sitemap.xml"]).not.toContain("lastmod");
      expect(files[".well-known/security.txt"]).toBeUndefined();
  });

  it("keeps the sitemap paths tied to registered Opsis routes and names", () => {
    // Informational publications live outside the provider-dependent tool shell.
    const app = ["../src/opsis/OpsisApp.tsx", "../src/App.tsx"].map((file) =>
      readFileSync(new URL(file, import.meta.url), "utf8"),
    ).join("\n");
    const model = readFileSync(
      new URL("../src/opsis/shell-model.ts", import.meta.url),
      "utf8",
    );
    const routes = new Set(
      [...app.matchAll(/path="([^"]+)"/g)].map((match) => match[1]),
    );
    const namedRoutes = new Set(
      [...model.matchAll(/^\s*"([^"\n]+)": \[/gm)].map((match) => match[1]),
    );
    expect(PUBLIC_PAGE_PATHS).toHaveLength(13);
    expect(new Set(PUBLIC_PAGE_PATHS).size).toBe(13);
    for (const path of PUBLIC_PAGE_PATHS) {
      expect(routes.has(path), path).toBe(true);
      if (path !== "/") expect(namedRoutes.has(path), path).toBe(true);
    }
  });

  it.each([
    { indexable: undefined },
    { indexable: "" },
    { indexable: "false" },
    { indexable: "TRUE" },
    { workspacesEnabled: undefined },
    { workspacesEnabled: "" },
    { workspacesEnabled: "false" },
    { publicAccessEnabled: undefined },
    { publicAccessEnabled: "" },
    { publicAccessEnabled: "TRUE" },
    { origin: "http://opsis.example" },
    { origin: "https://localhost" },
    { origin: "https://preview.localhost" },
    { origin: "https://127.0.0.1" },
    { origin: "https://[::1]" },
  ])("writes no sitemap when any condition is missing (%j)", (overrides) => {
    expect(generateSiteFiles({ ...settings, ...overrides })).toEqual({
      "robots.txt": "User-agent: *\nAllow: /\n",
    });
  });

  it("writes a security file with a 180-day UTC expiry and the security address", () => {
    const files = generateSiteFiles({
      ...settings,
      contact: contactAddresses(
        "support@opsis.example",
        "security@opsis.example",
      ),
    });
    expect(files[".well-known/security.txt"]).toBe(
      "Contact: mailto:security@opsis.example\nExpires: 2027-04-10T23:40:00Z\nPreferred-Languages: en, zh\nCanonical: https://opsis.example/.well-known/security.txt\n",
    );
  });

  it("writes support as the security fallback in previews, omitting an HTTP canonical", () => {
    const files = generateSiteFiles({
      ...settings,
      origin: "http://localhost:5173",
      indexable: undefined,
      contact: contactAddresses("support@opsis.example", undefined),
    });
    expect(files["robots.txt"]).toBe("User-agent: *\nAllow: /\n");
    expect(files["sitemap.xml"]).toBeUndefined();
    expect(files[".well-known/security.txt"]).toBe(
      "Contact: mailto:support@opsis.example\nExpires: 2027-04-10T23:40:00Z\nPreferred-Languages: en, zh\n",
    );
  });

  it("normalizes a trailing root slash", () => {
    expect(siteOrigin("https://opsis.example/")).toBe("https://opsis.example");
  });

  it.each([
    "",
    "   ",
    "not-a-url",
    "javascript:alert(1)",
    "ftp://opsis.example",
    "https:opsis.example",
    "https://support@opsis.example",
    "https://opsis.example/path",
    "https://opsis.example?x=1",
    "https://opsis.example#fragment",
    "https://opsis.example?",
    "https://opsis.example#",
    " https://opsis.example",
    "https://opsis.example\n",
    "https://opsis.example x",
    'https://opsis.example/"',
    "https://opsis.example/<x>",
    "https://opsis.example\\",
    "https://opsis.example,https://other.example",
    "https://opsis.example,other.example",
    "https://opsis&other.example",
    "https://-opsis.example",
    "https://例子.example",
  ])("rejects malformed or hostile canonical origins (%s)", (origin) => {
    expect(() => siteOrigin(origin)).toThrow(
      "VITE_PUBLIC_SITE_URL must be an HTTP or HTTPS site origin",
    );
    expect(() => generateSiteFiles({ ...settings, origin })).toThrow(
      "VITE_PUBLIC_SITE_URL",
    );
  });
});
