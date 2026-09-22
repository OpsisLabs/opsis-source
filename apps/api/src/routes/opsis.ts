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
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "private, no-store");
      const expiresAt = authorizeOpsisPreview(
        env,
        request.headers.authorization,
      );
      return {
        expiresAt: new Date(expiresAt).toISOString(),
        chainId: 4663,
        research: env.PRIVATE_MODE_ENABLED,
        tokenControls: env.PRIVATE_MODE_ENABLED && env.TOKEN_CONTROLS_ENABLED,
        exitCheck: env.EXIT_CHECK_ENABLED,
        watch: env.SCOUT_WATCH_ENABLED && env.PORTFOLIO_MODE_ENABLED,
        rwa: env.RWA_VERIFY_ENABLED,
        observedTrades: env.OBSERVED_TRADES_ENABLED,
        perpExecution: false,
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
