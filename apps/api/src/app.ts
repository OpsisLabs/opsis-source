import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { LogController } from "fastify";
import type { FastifyRequest } from "fastify";
import Redis from "ioredis";
import type { PrismaClient } from "@prisma/client";
import { JsonCache } from "./cache/service.js";
import type { Env } from "./config/env.js";
import { installErrorHandler } from "./http/errors.js";
import { installMetrics } from "./observability/metrics.js";
import { installRetention } from "./ops/retention.js";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { chatRoutes } from "./routes/chat.js";
import { entityRoutes } from "./routes/entities.js";
import { healthRoutes } from "./routes/health.js";
import { usageRoutes } from "./routes/usage.js";
import { swapRoutes } from "./routes/swaps.js";
import { privateRoutes, type PrivateAnalysisDependencies } from "./routes/private.js";
import { accountRoutes } from "./routes/account.js";
import { rateLimitKey } from "./http/authenticate.js";
import { installCsrfProtection } from "./http/csrf.js";
import { portfolioRoutes } from "./routes/portfolio.js";
import { PortfolioService, type PortfolioSnapshotSource } from "./portfolio/service.js";
import { createPortfolioBudget } from "./portfolio/budget.js";
import { rwaRoutes } from "./routes/rwa.js";
import { RwaService, type RwaVerificationSource } from "./rwa/service.js";
import { createRwaBudget } from "./rwa/budget.js";
import { collectibleRoutes } from "./routes/collectibles.js";
import { CollectibleCatalogService, type CollectibleCatalogSource } from "./collectibles/service.js";
import { createCollectibleBudget } from "./collectibles/budget.js";
import { marketRoutes } from "./routes/market.js";
import { MarketInventoryService, type MarketInventorySource } from "./market/service.js";
import { createMarketBudget } from "./market/budget.js";
import { openDataRoutes } from "./routes/open-data.js";
import type { OpenDataLimiter } from "./open-data/limiter.js";
import { corsOptionsForRequest } from "./http/cors.js";
import { installCloudWorkspaceGuard } from "./http/cloud-workspace.js";

export async function buildApp(
  env: Env,
  prisma?: PrismaClient,
  dependencies?: {
    privateAnalysis?: PrivateAnalysisDependencies;
    portfolioSnapshot?: PortfolioSnapshotSource;
    rwaVerification?: RwaVerificationSource;
    collectibleCatalog?: CollectibleCatalogSource;
    marketInventory?: MarketInventorySource;
    openDataLimiter?: OpenDataLimiter;
  }
) {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers.set-cookie",
          "authorization",
          "cookie",
          "refreshToken",
          "accessToken"
        ],
        censor: "[REDACTED]"
      }
    },
    // Fastify's default request logs include the raw URL and remote address.
    // ChainScout emits the bounded route-template summary below instead.
    logController: new LogController({ disableRequestLogging: true }),
    // Do not let Fastify consume X-Forwarded-For. Railway documents
    // X-Real-IP as its client-address header, and the rate-limit key accepts it
    // only when the socket peer is a trusted Railway/local proxy hop.
    trustProxy: false,
    bodyLimit: 1_000_000
  });
  app.addHook("onResponse", async (request, reply) => {
    request.log.info({
      route: request.routeOptions.url ?? "unmatched",
      statusCode: reply.statusCode,
      latencyMs: reply.elapsedTime
    }, "request summary");
  });
  installErrorHandler(app);
  const redis = env.REDIS_URL
    ? new Redis(env.REDIS_URL, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 })
    : undefined;
  if (redis) {
    await redis.connect();
    app.addHook("onClose", async () => {
      await redis.quit();
    });
  }
  const cache = new JsonCache(redis, env.CHAIN_CACHE_TTL_SECONDS);
  await app.register(cookie);
  await app.register(cors, {
    delegator: async (request: FastifyRequest) => corsOptionsForRequest(request.url, env),
  });
  installCsrfProtection(app, env);
  installCloudWorkspaceGuard(app, env, Boolean(prisma));
  await app.register(helmet);
  await app.register(rateLimit, {
    max: (request, key) => key.startsWith("user:") ? env.RATE_LIMIT_LOOKUP_PER_HOUR : env.RATE_LIMIT_PUBLIC_PER_HOUR,
    timeWindow: "1 hour",
    keyGenerator: (request) => rateLimitKey(request, env),
    redis,
    nameSpace: "rh:rate-limit:"
  });
  await app.register(swagger, {
    openapi: {
      info: { title: "ChainScout API", version: "0.1.0" },
      tags: [
        { name: "auth" },
        { name: "entities" },
        { name: "chat" },
        { name: "swaps" },
        { name: "private" },
        { name: "portfolio" },
        { name: "rwa" },
        { name: "collectibles" },
        { name: "market" },
        { name: "open-data" },
        { name: "account" },
        { name: "usage" },
        { name: "admin" }
      ]
    }
  });
  // The OpenAPI document is always built (routes stay self-describing), but the
  // browsable UI is only mounted where it is wanted.
  if (env.ENABLE_API_DOCS ?? env.NODE_ENV !== "production") {
    await app.register(swaggerUi, { routePrefix: "/docs" });
  }
  if (env.METRICS_TOKEN) {
    // 404 rather than 401 so an unauthenticated scraper cannot confirm it exists.
    app.addHook("onRequest", async (request, reply) => {
      if (!request.url.startsWith("/metrics")) return;
      if (request.headers.authorization !== `Bearer ${env.METRICS_TOKEN}`) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });
      }
    });
  }
  if (env.ENABLE_METRICS) await installMetrics(app);
  await healthRoutes(app, env, prisma, redis);
  await openDataRoutes(app, env, redis, dependencies?.openDataLimiter);
  await privateRoutes(app, env, prisma, cache, dependencies?.privateAnalysis);
  await portfolioRoutes(
    app,
    env,
    dependencies?.portfolioSnapshot ?? new PortfolioService(env, { budget: createPortfolioBudget(env, redis) })
  );
  await rwaRoutes(
    app,
    env,
    dependencies?.rwaVerification ?? new RwaService(env, { budget: createRwaBudget(env, redis) })
  );
  await collectibleRoutes(
    app,
    env,
    dependencies?.collectibleCatalog ?? new CollectibleCatalogService(env, { budget: createCollectibleBudget(env, redis) })
  );
  await marketRoutes(
    app,
    env,
    dependencies?.marketInventory ?? new MarketInventoryService(env, { budget: createMarketBudget(env, redis) })
  );
  await authRoutes(app, env, prisma);
  await accountRoutes(app, env, prisma);
  await entityRoutes(app, env, prisma, cache);
  await chatRoutes(app, env, prisma, cache);
  await usageRoutes(app, env, prisma);
  await swapRoutes(app, env, cache);
  await adminRoutes(app, env, prisma);
  if (prisma && env.RETENTION_ENABLED) installRetention(app, prisma, env);
  return app;
}
