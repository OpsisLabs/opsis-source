import { claimRoutes } from "./routes/claims.js";
import { ClaimCheckService } from "./claims/service.js";
import { EngineClaimSession } from "./claims/sources.js";
import { createClaimCheckBudget } from "./claims/budget.js";
import { launchRoutes } from "./routes/launches.js";
import { LaunchCardsService, type LaunchCardsSource } from "./launches/service.js";
import { createLaunchCardsBudget } from "./launches/budget.js";
import { StockDeskService, STOCK_DESK_ASSETS } from "./stock-desk/service.js";
import { reserveBudget } from "./stock-desk/budget.js";
import { stockDeskRoutes } from "./routes/stock-desk.js";
import { TokenCardService, type TokenCardSource } from "./cards/service.js";
import { EngineCardSources } from "./cards/sources.js";
import { publicMcpRoutes } from "./routes/public-mcp.js";
import { reachResponseHeaders } from "./routes/public-cards.js";
import { createAlertsRuntime } from "./alerts/runtime.js";
import { telegramRoutes, TelegramBotApi, TelegramBuckets, type BotApiClient } from "./telegram/service.js";
import { createOpenDataLimiter } from "./open-data/limiter.js";
import { AppError } from "./http/errors.js";
import { configuredReceiptService } from "./receipts/service.js";
import { receiptRoutes } from "./routes/receipts.js";
import { controlsRoutes } from "./routes/controls.js";
import { ControlsService } from "./controls/service.js";
import { opsisRoutes, installOpsisPreviewGuard } from "./routes/opsis.js";
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
import { publicSwapHistoryRoutes } from "./routes/public-swap-history.js";
import type { PublicSwapHistoryLookup } from "./routes/public-swap-history.js";
import { exitCheckRoutes } from "./routes/exit-check.js";
import { ExitCheckService, type ExitCheckSource } from "./exit-check/service.js";
import { createExitCheckBudget } from "./exit-check/budget.js";
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
import { BenchmarkService } from "./market/benchmarks.js";
import { MarketInventoryService, type MarketInventorySource } from "./market/service.js";
import { createMarketBudget } from "./market/budget.js";
import { ObservedTradesService, type ObservedTradesSource } from "./market/observed-trades.js";
import { createObservedTradesBudget } from "./market/observed-trades-budget.js";
import { RedisObservedTradesCoalescer } from "./market/observed-trades-coalescer.js";
import { createRobinhoodRpcSpendBudget } from "./chain/robinhood-rpc.js";
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
    observedTrades?: ObservedTradesSource;
    openDataLimiter?: OpenDataLimiter;
    launchCards?: LaunchCardsSource;
    exitCheck?: ExitCheckSource;
    tokenCards?: TokenCardSource;
    telegramBot?: BotApiClient;
    publicSwapHistory?: PublicSwapHistoryLookup;
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
    // Opsis emits the bounded route-template summary below instead.
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
  installOpsisPreviewGuard(app, env);
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
  // One account-wide monthly dRPC fuse shared by every Robinhood Chain reader.
  const rpcSpend = createRobinhoodRpcSpendBudget(env, redis);
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
      info: { title: "Opsis API", version: "0.1.0" },
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
  const receipts = configuredReceiptService(env);
  await receiptRoutes(app, env, receipts);
  const portfolioBudget = createPortfolioBudget(env, redis);
  const controls = new ControlsService(env, portfolioBudget, undefined, undefined, rpcSpend);
  const exitBudget = createExitCheckBudget(env, redis);
  const exit = dependencies?.exitCheck ?? new ExitCheckService(env, cache, { budget: exitBudget, rpcSpend });
  const cards = dependencies?.tokenCards ?? new TokenCardService({ check: async (address, evidence) => {
    if (!env.TOKEN_CONTROLS_ENABLED) throw new AppError("CONTROLS_DISABLED", 503, "Controls unavailable");
    return controls.check(address, evidence);
  } }, { quote: async (input) => {
    if (!env.EXIT_CHECK_ENABLED) throw new AppError("EXIT_CHECK_DISABLED", 503, "Trade Check unavailable");
    return exit.quote(input);
  } }, new EngineCardSources(env, portfolioBudget, rpcSpend), cache, env.PUBLIC_CARDS_CACHE_SECONDS, receipts);
  const openDataLimiter = dependencies?.openDataLimiter ?? createOpenDataLimiter(env, redis);
  await controlsRoutes(app, env, controls, receipts);
  const claimBudget = createClaimCheckBudget(env, redis);
  const claimLaunchBudget = createLaunchCardsBudget(env, redis);
  await claimRoutes(app, env, new ClaimCheckService(() => new EngineClaimSession(env, claimBudget, portfolioBudget, claimLaunchBudget, rpcSpend), receipts, env.RECEIPTS_ENABLED));
  await launchRoutes(app, env, dependencies?.launchCards ?? new LaunchCardsService(env, cache, { budget: claimLaunchBudget, rpcSpend, receipts }));
  await openDataRoutes(app, env, redis, openDataLimiter, cards);
  await app.register(async (scope) => {
    reachResponseHeaders(scope);
    await publicMcpRoutes(scope, env, openDataLimiter, cards, receipts);
  });
  const telegramBot = dependencies?.telegramBot ?? (env.TELEGRAM_BOT_ENABLED ? new TelegramBotApi(env.TELEGRAM_BOT_TOKEN!) : undefined);
  const telegramDispatch = new TelegramBuckets(env.TELEGRAM_WEBHOOK_SECRET ?? "");
  const alerts = createAlertsRuntime(env, redis, rpcSpend, telegramBot, telegramDispatch);
  if (alerts) await alerts.initialize(message => app.log.warn(message));
  await opsisRoutes(app, env, () => alerts?.status);
  await telegramRoutes(app, env, cards, telegramBot, alerts?.commands, telegramDispatch);
  if (alerts) {
    // Tests construct and start followers explicitly with fakes.
    if (env.NODE_ENV !== "test") app.addHook("onReady", async () => { alerts.follower.start(); });
    app.addHook("preClose", async () => { await alerts.follower.stop(); });
  }
  await privateRoutes(app, env, prisma, cache, dependencies?.privateAnalysis, rpcSpend);
  await portfolioRoutes(
    app,
    env,
    dependencies?.portfolioSnapshot ?? new PortfolioService(env, { budget: createPortfolioBudget(env, redis), rpcSpend })
  );
  const rwaBudget = createRwaBudget(env, redis);
  const deskRwa = new RwaService(env, { budget: rwaBudget, rpcSpend });
  await rwaRoutes(app, env, dependencies?.rwaVerification ?? deskRwa);
  const deskExitBudget = exitBudget;
  const deskEngines = { rwa: deskRwa, exit, market: new EngineCardSources(env, portfolioBudget, rpcSpend) };
  await stockDeskRoutes(app, env, new StockDeskService(deskEngines, async () => {
    const count = STOCK_DESK_ASSETS.length;
    const rwaReservation = await reserveBudget(rwaBudget, count * env.RWA_MAX_RPC_SUBCALLS);
    const exitReservation = await reserveBudget(deskExitBudget, count * 4 * env.EXIT_CHECK_MAX_RPC_SUBCALLS);
    const explorerReservation = await reserveBudget(portfolioBudget, count * 12);
    return {
      rwa: new RwaService(env, { budget: rwaReservation, rpcSpend }),
      exit: new ExitCheckService(env, cache, { budget: exitReservation, rpcSpend }),
      market: new EngineCardSources(env, explorerReservation, rpcSpend),
    };
  }, env.STOCK_DESK_CACHE_SECONDS, receipts));
  await collectibleRoutes(
    app,
    env,
    dependencies?.collectibleCatalog ?? new CollectibleCatalogService(env, { budget: createCollectibleBudget(env, redis) })
  );
  await marketRoutes(
    app,
    env,
    dependencies?.marketInventory ?? new MarketInventoryService(env, { budget: createMarketBudget(env, redis) }),
    new BenchmarkService(env, { budget: createCollectibleBudget(env, redis) }),
    dependencies?.observedTrades ?? (() => {
      const source = new ObservedTradesService(env, { budget: createObservedTradesBudget(env, redis), rpcSpend });
      return redis
        ? new RedisObservedTradesCoalescer(source, redis, env.OBSERVED_TRADES_MIN_BLOCKS, env.OBSERVED_TRADES_MAX_BLOCKS)
        : source;
    })()
  );
  await authRoutes(app, env, prisma);
  await accountRoutes(app, env, prisma);
  await entityRoutes(app, env, prisma, cache);
  await chatRoutes(app, env, prisma, cache);
  await usageRoutes(app, env, prisma);
  await swapRoutes(app, env, cache, undefined, { budget: exitBudget, rpcSpend });
  await publicSwapHistoryRoutes(app, env, prisma, dependencies?.publicSwapHistory);
  await exitCheckRoutes(
    app,
    env,
    cache,
    exit
  );
  await adminRoutes(app, env, prisma);
  if (prisma && env.RETENTION_ENABLED) installRetention(app, prisma, env);
  return app;
}
