import { useEffect } from "react";
import { useLocation } from "react-router";

type RouteMetadataEntry = {
  title: string;
  description: string;
  canonicalPath?: string;
  noIndex?: boolean;
};

const HOME_DESCRIPTION =
  "Track crypto, NFTs, tokenized assets, Pokémon cards, collectibles, and anything else in one encrypted local Vault—then inspect source-linked Robinhood Chain activity.";

const ROUTE_METADATA: Record<string, RouteMetadataEntry> = {
  "/card-prices": {
    title: "Card Price Check | ChainScout",
    description: "Check Pokémon and Yu-Gi-Oh! price references across supported markets. No wallet required. Reference prices, not live offers or graded-card appraisals.",
  },
  "/": {
    title: "ChainScout — Private Multi-Asset Command Center",
    description: HOME_DESCRIPTION,
  },
  "/app": {
    title: "Private Explorer | ChainScout",
    description:
      "Explain a public Robinhood Chain wallet, transaction, token, or contract with source-linked evidence—without connecting a wallet or creating an account.",
  },
  "/vault": {
    title: "Encrypted Asset Vault | ChainScout",
    description:
      "Track crypto, NFTs, tokenized assets, cards, collectibles, purchase lots, photos, and dated values in an encrypted browser-local Vault.",
  },
  "/rwa": {
    title: "RWA Verify | ChainScout",
    description:
      "Review source-linked Robinhood Chain tokenized-asset identity, custody, oracle, yield, and redemption evidence with explicit limitations.",
  },
  "/swap": {
    title: "Scout Swap Preview | ChainScout",
    description:
      "Preview a current Robinhood Chain swap route, simulation, price impact, and network cost before handing execution to the official Uniswap app.",
  },
  "/guide": {
    title: "Feature Guide | ChainScout",
    description:
      "Follow clear workflows for ChainScout's private Explorer, encrypted Vault, portfolio tools, RWA verification, and read-only swap previews.",
  },
  "/docs": {
    title: "Technical Docs | ChainScout",
    description:
      "Read how ChainScout handles public chain data, citations, encrypted browser-local records, provider boundaries, and read-only transaction previews.",
  },
  "/faq": {
    title: "FAQ | ChainScout",
    description:
      "Answers about ChainScout privacy, wallet connections, encrypted Vault storage, public data sources, asset coverage, and safety boundaries.",
  },
  "/roadmap": {
    title: "Product Roadmap | ChainScout",
    description:
      "Explore ChainScout's reviewed product roadmap and the release gates behind its private, read-only multi-asset workspace.",
  },
  "/privacy": {
    title: "Privacy Policy | ChainScout",
    description:
      "Understand what ChainScout processes, what stays encrypted in your browser, what reaches public providers, and how optional account data can be removed.",
  },
  "/terms": {
    title: "Terms of Use | ChainScout",
    description:
      "Review the terms and limitations for ChainScout's informational, read-only, non-custodial tools.",
  },
  "/developers": {
    title: "Open Data API | ChainScout",
    description:
      "Review ChainScout's bounded public support registry and syntax-normalization API when the developer surface is enabled.",
  },
  "/login": {
    title: "Sign In | ChainScout",
    description:
      "Optionally sign in to a ChainScout cloud workspace using a wallet message signature or account credentials.",
    noIndex: true,
  },
  "/register": {
    title: "Create Account | ChainScout",
    description:
      "Optionally create a ChainScout cloud workspace; the encrypted browser-local Vault remains separate.",
    noIndex: true,
  },
  "/cloud": {
    title: "Cloud Workspace | ChainScout",
    description: "Your optional signed-in ChainScout workspace.",
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

  useEffect(() => {
    const metadata = findMetadata(pathname);
    if (!metadata) return;
    const canonicalUrl = new URL(
      metadata.canonicalPath ?? pathname,
      PUBLIC_ORIGIN,
    ).href;

    document.title = metadata.title;
    canonicalElement?.setAttribute("href", canonicalUrl);
    setMeta('meta[name="description"]', metadata.description);
    setMeta('meta[property="og:title"]', metadata.title);
    setMeta('meta[property="og:description"]', metadata.description);
    setMeta('meta[property="og:url"]', canonicalUrl);
    setMeta('meta[name="twitter:title"]', metadata.title);
    setMeta('meta[name="twitter:description"]', metadata.description);

    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.append(robots);
    }
    robots.content = metadata.noIndex ? "noindex,nofollow" : "index,follow";
  }, [pathname]);

  return null;
}
