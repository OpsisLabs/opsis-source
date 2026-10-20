import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { describeAlertsStorage, type AlertsStorageStatus } from "../alerts/store.js";
import { AppError } from "../http/errors.js";

// Independent from account authentication. Only a hash is configured; keys are
// never returned, stored in the browser, or accepted in a URL.
export function authorizeOpsisPreview(
  env: Env,
  authorization?: string,
  now = Date.now(),
): number {
  // D13: public access removes only the deployment password, not feature gates.
  if (env.OPSIS_WORKSPACES_ENABLED && env.OPSIS_PUBLIC_ACCESS_ENABLED)
    return now + 3_600_000;
  const key = /^Preview ([a-f0-9]{64})$/.exec(authorization ?? "")?.[1];
  const hash = env.OPSIS_PREVIEW_HASH;
  const expires = Date.parse(env.OPSIS_PREVIEW_EXPIRES_AT ?? "");
  if (
    !env.OPSIS_WORKSPACES_ENABLED ||
    !key ||
    !hash ||
    !/^[a-f0-9]{64}$/.test(hash) ||
    !Number.isFinite(expires) ||
    expires <= now ||
    !timingSafeEqual(
      createHash("sha256").update(key).digest(),
      Buffer.from(hash, "hex"),
    )
  ) {
    throw new AppError("NOT_FOUND", 404, "Preview unavailable");
  }
  return Math.min(expires, now + 3_600_000);
}

export async function opsisRoutes(app: FastifyInstance, env: Env, alertsStatus?: () => AlertsStorageStatus | undefined) {
  app.post(
    "/v1/private/opsis/access",
    {
      schema: { hide: true },
      config: { rateLimit: { max: env.RATE_LIMIT_ACCESS_PER_MINUTE, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "private, no-store");
      const expiresAt = authorizeOpsisPreview(
        env,
        request.headers.authorization,
      );
      const onchain = env.SWAP_QUOTE_SOURCE === "onchain";
      const swapPreview = env.UNISWAP_QUOTE_ENABLED && (onchain || Boolean(env.UNISWAP_API_KEY));
      const manifest = {
        version: 1,
        chain: { id: 4663, name: "Robinhood Chain" },
        build: env.BUILD_SHA ?? env.RAILWAY_GIT_COMMIT_SHA ?? null,
        capabilities: [
          ...(env.SAVED_CHECK_COMPARISONS_ENABLED ? [{ id: "savedCheckComparisons", enabled: true, scope: "Local saved token Research and Trade Check comparisons", origin: "encrypted browser records", freshness: "historical observation times", coverage: "matching typed evidence only", limits: "No automatic lookup; different inputs or missing coverage are not market changes." }] : []),
          { id: "research", enabled: env.PRIVATE_MODE_ENABLED, scope: "Robinhood Chain public-identifier research", origin: "live on request", freshness: "checked per request", coverage: "bounded by upstream source coverage", limits: "Provider health and complete coverage are unknown until each lookup." },
          { id: "contractFacts", enabled: env.PRIVATE_MODE_ENABLED && env.CONTRACT_FACTS_ENABLED, scope: "Blockscout contract facts", origin: "existing explorer documents on request", freshness: "original explorer read time; token documents reused within the configured cache window", coverage: "reported verification, compiler and proxy metadata only", limits: "Unavailable or malformed evidence stays unknown. Source verification does not establish contract behaviour." },
          ...(env.NETWORK_PULSE_ENABLED ? [{ id: "networkPulse", enabled: true, scope: "Robinhood Chain 4663 network observations", origin: "read-only RPC and on-chain Chainlink ETH/USD", freshness: "15-second server cache; 30-second visible-page refresh", coverage: "latest and safe blocks, gas price, ETH/USD round and RPC read latency", limits: "Four independent batched RPC reads; current, not final. Unknown values carry a reason; no network-wide uptime claim." }] : []),
          { id: "tokenControls", enabled: env.PRIVATE_MODE_ENABLED && env.TOKEN_CONTROLS_ENABLED, scope: "Robinhood Chain standard contract controls", origin: "live RPC on request", freshness: "block-anchored per request", coverage: "owner, pause responses and three proxy slots only", limits: "Mint privileges, custom roles, transfer taxes and concentration are not inferred; optional explorer enrichment may be unavailable." },
          { id: "exitCheck", enabled: env.EXIT_CHECK_ENABLED, scope: "Robinhood Chain official Uniswap V3 standard fee tiers", origin: "live RPC on request", freshness: "block-anchored per quote", coverage: "bounded factory pools and configured RPC quota", limits: "Does not prove transferability, sellability or execution; V4 and other venues are excluded." },
          { id: "watch", enabled: env.WATCH_ENABLED && env.PORTFOLIO_MODE_ENABLED, scope: "Robinhood Chain user-triggered wallet snapshots", origin: "captured on user request", freshness: "snapshot timestamp; no background monitoring", coverage: "supported assets and upstream discovery coverage", limits: "Not continuous monitoring; missing upstream data stays unknown." },
          { id: "rwa", enabled: env.RWA_VERIFY_ENABLED, scope: "Existing source-backed RWA verification checks", origin: "live on request", freshness: "checked per request", coverage: "bounded to supported sources and configured RPC quota", limits: "Not an appraisal, eligibility decision or proof of tradability." },
          { id: "observedTrades", enabled: env.OBSERVED_TRADES_ENABLED, scope: "Robinhood Chain decoded Uniswap V3 Swap logs", origin: "live scan on request", freshness: "anchored to captured block window", coverage: "configured block and log caps", limits: "Observed swaps only; gaps and partial windows remain explicit; transfers are not trades." },
          { id: "swapPreview", enabled: swapPreview, scope: onchain ? "Robinhood Chain WETH/USDG single-pool estimate through official Uniswap V3 QuoterV2" : "Robinhood Chain WETH/USDG quote preview through the Uniswap Trade API", origin: onchain ? "on-chain RPC and Chainlink ETH / USD on request" : "live quote on request", freshness: onchain ? "block-anchored quote; Uniswap independently requotes" : "short-lived quote; Uniswap requotes before any trade", coverage: onchain ? "WETH/USDG standard V3 fee tiers; single pool only" : "WETH and USDG only", limits: onchain ? "Uniswap's app may route differently. User-paid network and LP costs apply. Opsis never signs or broadcasts." : "A preview, not an execution; Opsis never signs or broadcasts." },
          { id: "stockDesk", enabled: env.STOCK_DESK_ENABLED && env.RWA_VERIFY_ENABLED && env.EXIT_CHECK_ENABLED, scope: "Stock Token Desk and reviewed-sample index", origin: "on explicit request", freshness: "independent source times and anchors", coverage: "ten reviewed Stock Tokens; unknown facts remain explicit", limits: "Data, not advice. USDG units are not dollars. Tool budgets apply." },
          { id: "publicCards", enabled: env.OPEN_DATA_API_ENABLED && env.PUBLIC_CARDS_ENABLED, scope: "Public token cards and SVG embeds", origin: "on explicit request", freshness: "independent source times and anchors", coverage: "partial; unknown remains unknown", limits: "Not investment advice. Provider and tool budgets apply." },
          { id: "publicMcp", enabled: env.OPEN_DATA_API_ENABLED && env.PUBLIC_MCP_ENABLED, scope: "Read-only MCP tools", origin: "on explicit request", freshness: "independent source times and anchors", coverage: "partial; unknown remains unknown", limits: "Not investment advice. Provider and tool budgets apply." },
          { id: "alerts", enabled: env.ALERTS_ENABLED, scope: "Opt-in alerts in Telegram", origin: "bounded block follower", freshness: `selected ${env.ALERTS_BLOCK_TAG} block; polling and provider lag apply`, coverage: "four rule types; rules expire after 30 days", limits: `${alertsStatus?.()?.reason ? `Degraded: ${alertsStatus()!.reason}. New rules are unavailable.` : "Opt-in rules expire after 30 days."} Alerts can be lost if the Redis store resets; re-create them. ${describeAlertsStorage(alertsStatus?.())}. Not investment advice.` },
          { id: "telegramBot", enabled: env.TELEGRAM_BOT_ENABLED, scope: "Prompted Telegram token cards", origin: "on explicit request", freshness: "independent source times and anchors", coverage: "partial; unknown remains unknown", limits: "Not investment advice. Provider and tool budgets apply." },
          { id: "openDataSql", enabled: env.OPEN_DATA_SQL_ENABLED, scope: "Browser SQL over your own CSV files", origin: "user-picked device files", freshness: "user-supplied files", coverage: "up to four CSV files", limits: "50 MB each, 100 MB total; browser worker only; files and queries never leave this device." },
          { id: "openDataDatasets", enabled: env.OPEN_DATA_SQL_ENABLED && env.OPEN_DATA_DATASETS_ENABLED, scope: "Published Opsis datasets", origin: "same-origin static files", freshness: "dataset generation time", coverage: "reviewed published files only", limits: "Not available." },
          { id: "launchCards", enabled: env.PRIVATE_MODE_ENABLED && env.LAUNCH_CARDS_ENABLED, scope: "Robinhood Chain reviewed launch events", origin: "RPC on explicit request", freshness: "block-anchored cards; briefly cached feed", coverage: "bounded registry, timestamp windows and read caps", limits: "Unknown stays unknown. Pons addresses unconfirmed by the launchpad. Not investment advice." },
          { id: "linkedWallets", enabled: env.PRIVATE_MODE_ENABLED && env.LINKED_WALLETS_ENABLED, scope: "Top 100 explorer holders linked by funding", origin: "explorer and RPC on explicit request", freshness: "anchor balances; briefly cached observations", coverage: "bounded first funding and launch-window links; explorer selection not block-pinned", limits: "Funding inferences only. Hubs excluded. Not investment advice." },
          { id: "claimCheck", enabled: env.PRIVATE_MODE_ENABLED && env.CLAIM_CHECK_ENABLED, scope: "Published deterministic token claims", origin: "on explicit request", freshness: "current and optional post-time blocks", coverage: "published types; partial evidence stays unknown", limits: "Address confirmation required. No text fetching or AI. Explorer evidence is current-only." },
          { id: "receipts", enabled: env.PRIVATE_MODE_ENABLED && env.RECEIPTS_ENABLED, scope: "Signed block-anchored computation receipts", origin: "on explicit request", freshness: "issued per request", coverage: "token controls reference integration only", limits: "Signature and inclusion checks do not establish correctness or Bitcoin attestation." },
          { id: "perpHandoff", enabled: env.PERP_HANDOFF_ENABLED, scope: "Reviewed directory of perpetual-futures venues by stated region; no orders and no eligibility verification", origin: "static review, checked 2026-10-12", freshness: "re-review due within 120 days", coverage: "United States and Canada only", limits: "Each venue's own pages govern; Opsis verifies no identity or eligibility" },
        ],
      };
      return {
        expiresAt: new Date(expiresAt).toISOString(),
        chainId: 4663,
        networkPulse: env.NETWORK_PULSE_ENABLED,
        research: env.PRIVATE_MODE_ENABLED,
        tokenControls: env.PRIVATE_MODE_ENABLED && env.TOKEN_CONTROLS_ENABLED,
        contractFacts: env.PRIVATE_MODE_ENABLED && env.CONTRACT_FACTS_ENABLED,
        exitCheck: env.EXIT_CHECK_ENABLED,
        watch: env.WATCH_ENABLED && env.PORTFOLIO_MODE_ENABLED,
        rwa: env.RWA_VERIFY_ENABLED,
        observedTrades: env.OBSERVED_TRADES_ENABLED,
        swapPreview,
        stockDesk: env.STOCK_DESK_ENABLED && env.RWA_VERIFY_ENABLED && env.EXIT_CHECK_ENABLED,
        publicCards: env.OPEN_DATA_API_ENABLED && env.PUBLIC_CARDS_ENABLED,
        publicMcp: env.OPEN_DATA_API_ENABLED && env.PUBLIC_MCP_ENABLED,
        telegramBot: env.TELEGRAM_BOT_ENABLED,
        alerts: env.ALERTS_ENABLED,
        openDataSql: env.OPEN_DATA_SQL_ENABLED,
        openDataDatasets: env.OPEN_DATA_SQL_ENABLED && env.OPEN_DATA_DATASETS_ENABLED,
        launchCards: env.PRIVATE_MODE_ENABLED && env.LAUNCH_CARDS_ENABLED,
        linkedWallets: env.PRIVATE_MODE_ENABLED && env.LINKED_WALLETS_ENABLED,
        claimCheck: env.PRIVATE_MODE_ENABLED && env.CLAIM_CHECK_ENABLED,
        receipts: env.PRIVATE_MODE_ENABLED && env.RECEIPTS_ENABLED,
        perpHandoff: env.PERP_HANDOFF_ENABLED,
        savedCheckComparisons: env.SAVED_CHECK_COMPARISONS_ENABLED,
        perpExecution: false,
        manifest,
      };
    },
  );
}

// Isolated preview instances protect reused private engines too. Authorization
// runs before payload parsing/provider work and on every request, so revocation
// and expiry cannot be bypassed by keeping the browser open.
export function installOpsisPreviewGuard(app: FastifyInstance, env: Env) {
  app.addHook("onRequest", async (request, reply) => {
    if (!env.OPSIS_WORKSPACES_ENABLED) return;
    const path =
      request.routeOptions.url ??
      new URL(request.url, "http://local.invalid").pathname;
    if (!path.startsWith("/v1/private/") || path === "/v1/private/opsis/access")
      return;
    reply.header("Cache-Control", "private, no-store");
    authorizeOpsisPreview(env, request.headers.authorization);
  });
}
