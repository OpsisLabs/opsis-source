import type { ContactAddresses } from "../src/product/contact";
import { PUBLIC_PAGE_PATHS } from "../src/product/public-pages";

export { PUBLIC_PAGE_PATHS };

export function siteOrigin(raw: string): string {
  const message =
    "VITE_PUBLIC_SITE_URL must be an HTTP or HTTPS site origin without credentials, a path, query, fragment or whitespace";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(message);
  }
  if (
    /[^\x21-\x7e]/.test(raw) ||
    /[<>"'\\]/.test(raw) ||
    !/^https?:\/\//.test(raw) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !/^https?:\/\/[^/?#]+\/?$/.test(raw) ||
    (!url.hostname.startsWith("[") &&
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(
        url.hostname,
      ))
  )
    throw new Error(message);
  return url.origin;
}

export function generateSiteFiles({
  origin,
  indexable: indexableSetting,
  workspacesEnabled,
  publicAccessEnabled,
  contact,
  builtAt,
}: {
  origin: string;
  indexable?: string;
  workspacesEnabled?: string;
  publicAccessEnabled?: string;
  contact: ContactAddresses | null;
  builtAt: Date;
}): Record<string, string> {
  const canonical = siteOrigin(origin);
  const url = new URL(canonical);
  const localhost =
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    /^127\./.test(url.hostname) ||
    url.hostname === "[::1]";
  // Indexing is an explicit choice per build, never a side effect of the release stage.
  const indexable =
    indexableSetting === "true" &&
    workspacesEnabled === "true" &&
    publicAccessEnabled === "true" &&
    url.protocol === "https:" &&
    !localhost;
  // A build that is not indexable still allows crawling: its pages carry
  // "noindex", and a crawler has to be able to fetch a page to read that.
  const files: Record<string, string> = {
    "robots.txt": indexable
      ? `User-agent: *\nAllow: /\nSitemap: ${canonical}/sitemap.xml\n`
      : "User-agent: *\nAllow: /\n",
  };
  if (indexable) {
    files["sitemap.xml"] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...PUBLIC_PAGE_PATHS.map(
        (path) => `  <url><loc>${canonical}${path}</loc></url>`,
      ),
      "</urlset>",
      "",
    ].join("\n");
  }
  if (contact) {
    const expires = new Date(builtAt.getTime() + 180 * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");
    files[".well-known/security.txt"] = [
      `Contact: mailto:${contact.security}`,
      `Expires: ${expires}`,
      "Preferred-Languages: en, zh",
      ...(url.protocol === "https:"
        ? [`Canonical: ${canonical}/.well-known/security.txt`]
        : []),
      "",
    ].join("\n");
  }
  return files;
}
