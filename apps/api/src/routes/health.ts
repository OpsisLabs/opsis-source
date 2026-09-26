import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "../config/env.js";
import { retentionReadiness } from "../ops/retention.js";

type RedisHealth = { ping(): Promise<string> };
type ProviderConfiguration = { configured: boolean; status: "not_checked" | "disabled" };

function providerConfiguration(configured: boolean): ProviderConfiguration {
  return { configured, status: configured ? "not_checked" : "disabled" };
}

export async function healthRoutes(app: FastifyInstance, env: Env, prisma?: PrismaClient, redis?: RedisHealth): Promise<void> {
  app.get("/healthz", { config: { rateLimit: false } }, async () => ({
    ok: true,
    // Public deployment identity contains no secret and lets release QA prove
    // that the reviewed commit is the one actually serving traffic.
    buildSha: env.BUILD_SHA ?? env.RAILWAY_GIT_COMMIT_SHA ?? null
  }));
  app.get("/readyz", { config: { rateLimit: false } }, async (_request, reply) => {
    let database: "up" | "memory" | "unavailable" = prisma ? "up" : "memory";
    let redisStatus: "up" | "disabled" | "unavailable" = redis ? "up" : "disabled";
    let ok = true;
    if (prisma) {
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        database = "unavailable";
        ok = false;
      }
    }
    if (redis) {
      try {
        if (await redis.ping() !== "PONG") throw new Error("REDIS_NOT_READY");
      } catch {
        redisStatus = "unavailable";
        ok = false;
      }
    }
    const retention = retentionReadiness(Boolean(prisma && env.RETENTION_ENABLED), env.RETENTION_INTERVAL_HOURS);
    if (retention.status === "unavailable") ok = false;

    const status = {
      deploymentMode: env.CLOUD_WORKSPACE_ENABLED ? "cloud" : "private-only",
      cloudWorkspace: !env.CLOUD_WORKSPACE_ENABLED ? "disabled" : prisma ? "enabled" : "unavailable",
      database,
      redis: redisStatus,
      retention,
      providers: {
        // Readiness is intentionally limited to dependencies owned by this
        // service. Provider availability is observed on real requests; do not
        // label configuration as health without performing a live probe.
        blockscout: providerConfiguration(Boolean(env.BLOCKSCOUT_API_BASE_URL)),
        alchemy: providerConfiguration(Boolean(env.ALCHEMY_ROBINHOOD_RPC_URL || env.ALCHEMY_API_KEY)),
        uniswap: providerConfiguration(env.UNISWAP_QUOTE_ENABLED && Boolean(env.UNISWAP_API_KEY)),
        goldrush: providerConfiguration(env.GOLDRUSH_ENABLED && Boolean(env.GOLDRUSH_API_KEY)),
        // Names the server-side Robinhood Chain transport without exposing any
        // endpoint or credential, so operators can confirm production uses dRPC.
        robinhoodRpc: { transport: env.ROBINHOOD_RPC_PROVIDER, ...providerConfiguration(env.ROBINHOOD_RPC_PROVIDER === "robinhood-public" || Boolean(env.DRPC_API_KEY)) }
      }
    };
    return ok ? { ok: true, ...status } : reply.status(503).send({ ok: false, ...status });
  });
}
