import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
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

export async function opsisRoutes(app: FastifyInstance, env: Env) {
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
      // Swap and trade-scenario quotes need the server-side Uniswap key.
      const swapPreview = env.UNISWAP_QUOTE_ENABLED && Boolean(env.UNISWAP_API_KEY);
      const manifest = {
        version: 1,
        chain: { id: 4663, name: "Robinhood Chain" },
        build: env.BUILD_SHA ?? env.RAILWAY_GIT_COMMIT_SHA ?? null,
        capabilities: [
          ...(env.SAVED_CHECK_COMPARISONS_ENABLED ? [{ id: "savedCheckComparisons", enabled: true, scope: "Local saved token Research and Trade Check comparisons", origin: "encrypted browser records", freshness: "historical observation times", coverage: "matching typed evidence only", limits: "No automatic lookup; different inputs or missing coverage are not market changes." }] : []),
          { id: "research", enabled: env.PRIVATE_MODE_ENABLED, scope: "Robinhood Chain public-identifier research", origin: "live on request", freshness: "checked per request", coverage: "bounded by upstream source coverage", limits: "Provider health and complete coverage are unknown until each lookup." },
          { id: "tokenControls", enabled: env.PRIVATE_MODE_ENABLED && env.TOKEN_CONTROLS_ENABLED, scope: "Robinhood Chain standard contract controls", origin: "live RPC on request", freshness: "block-anchored per request", coverage: "owner, pause responses and three proxy slots only", limits: "Mint privileges, custom roles, transfer taxes and concentration are not inferred; optional explorer enrichment may be unavailable." },
          { id: "exitCheck", enabled: env.EXIT_CHECK_ENABLED, scope: "Robinhood Chain official Uniswap V3 standard fee tiers", origin: "live RPC on request", freshness: "block-anchored per quote", coverage: "bounded factory pools and configured RPC quota", limits: "Does not prove transferability, sellability or execution; V4 and other venues are excluded." },
          { id: "watch", enabled: env.WATCH_ENABLED && env.PORTFOLIO_MODE_ENABLED, scope: "Robinhood Chain user-triggered wallet snapshots", origin: "captured on user request", freshness: "snapshot timestamp; no background monitoring", coverage: "supported assets and upstream discovery coverage", limits: "Not continuous monitoring; missing upstream data stays unknown." },
          { id: "rwa", enabled: env.RWA_VERIFY_ENABLED, scope: "Existing source-backed RWA verification checks", origin: "live on request", freshness: "checked per request", coverage: "bounded to supported sources and configured RPC quota", limits: "Not an appraisal, eligibility decision or proof of tradability." },
          { id: "observedTrades", enabled: env.OBSERVED_TRADES_ENABLED, scope: "Robinhood Chain decoded Uniswap V3 Swap logs", origin: "live scan on request", freshness: "anchored to captured block window", coverage: "configured block and log caps", limits: "Observed swaps only; gaps and partial windows remain explicit; transfers are not trades." },
          { id: "swapPreview", enabled: swapPreview, scope: "Robinhood Chain WETH/USDG quote preview through the Uniswap Trade API", origin: "live quote on request", freshness: "short-lived quote; Uniswap requotes before any trade", coverage: "WETH and USDG only", limits: "A preview, not an execution; Opsis never signs or broadcasts." },
          { id: "receipts", enabled: env.PRIVATE_MODE_ENABLED && env.RECEIPTS_ENABLED, scope: "Signed block-anchored computation receipts", origin: "on explicit request", freshness: "issued per request", coverage: "token controls reference integration only", limits: "Signature and inclusion checks do not establish correctness or Bitcoin attestation." },
          { id: "perpHandoff", enabled: env.PERP_HANDOFF_ENABLED, scope: "Reviewed directory of perpetual-futures venues by stated region; no orders and no eligibility verification", origin: "static review, checked 2026-10-12", freshness: "re-review due within 120 days", coverage: "United States and Canada only", limits: "Each venue's own pages govern; Opsis verifies no identity or eligibility" },
        ],
      };
      return {
        expiresAt: new Date(expiresAt).toISOString(),
        chainId: 4663,
        research: env.PRIVATE_MODE_ENABLED,
        tokenControls: env.PRIVATE_MODE_ENABLED && env.TOKEN_CONTROLS_ENABLED,
        exitCheck: env.EXIT_CHECK_ENABLED,
        watch: env.WATCH_ENABLED && env.PORTFOLIO_MODE_ENABLED,
        rwa: env.RWA_VERIFY_ENABLED,
        observedTrades: env.OBSERVED_TRADES_ENABLED,
        swapPreview,
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
