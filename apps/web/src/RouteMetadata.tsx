import { useEffect } from "react";
import { useLocation } from "react-router";
import { useI18n, type TranslationKey } from "./i18n";

type RouteMetadataEntry = {
  title: TranslationKey;
  description: TranslationKey;
  canonicalPath?: string;
  noIndex?: boolean;
};

const ROUTE_METADATA: Record<string, RouteMetadataEntry> = {
  "/situation-room": { title: "situation.metadata.title", description: "situation.metadata.description" },
  "/watch": { title: "watch.metadata.title", description: "watch.metadata.description", noIndex: true },
  "/card-prices": {
    title: "cards.metadata.title",
    description: "cards.metadata.description",
  },
  "/": {
    title: "metadata.home.title",
    description: "metadata.home.description",
  },
  "/app": {
    title: "metadata.explorer.title",
    description: "metadata.explorer.description",
  },
  "/vault": {
    title: "metadata.vault.title",
    description: "metadata.vault.description",
  },
  "/rwa": {
    title: "metadata.rwa.title",
    description: "metadata.rwa.description",
  },
  "/swap": {
    title: "metadata.swap.title",
    description: "metadata.swap.description",
  },
  "/simulate": {
    title: "metadata.simulator.title",
    description: "metadata.simulator.description",
    noIndex: true,
  },
  "/guide": {
    title: "metadata.guide.title",
    description: "metadata.guide.description",
  },
  "/docs": {
    title: "metadata.docs.title",
    description: "metadata.docs.description",
  },
  "/faq": {
    title: "metadata.faq.title",
    description: "metadata.faq.description",
  },
  "/roadmap": {
    title: "metadata.roadmap.title",
    description: "metadata.roadmap.description",
  },
  "/privacy": {
    title: "metadata.privacy.title",
    description: "metadata.privacy.description",
  },
  "/terms": {
    title: "metadata.terms.title",
    description: "metadata.terms.description",
  },
  "/developers": {
    title: "metadata.developers.title",
    description: "metadata.developers.description",
  },
  "/login": {
    title: "metadata.login.title",
    description: "metadata.login.description",
    noIndex: true,
  },
  "/register": {
    title: "metadata.register.title",
    description: "metadata.register.description",
    noIndex: true,
  },
  "/cloud": {
    title: "metadata.cloud.title",
    description: "metadata.cloud.description",
    canonicalPath: "/cloud",
    noIndex: true,
  },
};

const canonicalElement = document.querySelector<HTMLLinkElement>(
  'link[rel="canonical"]',
);
const PUBLIC_ORIGIN = (() => {
  try {
    return new URL(canonicalElement?.href || window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
})();

function findMetadata(pathname: string) {
  if (pathname.startsWith("/cloud")) return ROUTE_METADATA["/cloud"];
  return ROUTE_METADATA[pathname] ?? ROUTE_METADATA["/"];
}

function setMeta(selector: string, value: string) {
  document
    .querySelector<HTMLMetaElement>(selector)
    ?.setAttribute("content", value);
}

export default function RouteMetadata() {
  const { pathname } = useLocation();
  const { locale, t } = useI18n();

  useEffect(() => {
    const metadata = findMetadata(pathname);
    if (!metadata) return;
    const canonicalUrl = new URL(
      metadata.canonicalPath ?? pathname,
      PUBLIC_ORIGIN,
    ).href;
    const title = t(metadata.title);
    const description = t(metadata.description);

    document.title = title;
    canonicalElement?.setAttribute("href", canonicalUrl);
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:url"]', canonicalUrl);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);

    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.append(robots);
    }
    robots.content = metadata.noIndex ? "noindex,nofollow" : "index,follow";
  }, [pathname, locale, t]);

  return null;
}
