import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "../config/env.js";

type RedisHealth = { ping(): Promise<string> };
type ProviderConfiguration = { configured: boolean; status: "not_checked" | "disabled" };

function providerConfiguration(configured: boolean): ProviderConfiguration {
  return { configured, status: configured ? "not_checked" : "disabled" };
}

export async function healthRoutes(app: FastifyInstance, env: Env, prisma?: PrismaClient, redis?: RedisHealth): Promise<void> {
  app.get("/healthz", { config: { rateLimit: false } }, async () => ({ ok: true }));
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

    const status = {
      database,
      redis: redisStatus,
      providers: {
        // Readiness is intentionally limited to dependencies owned by this
        // service. Provider availability is observed on real requests; do not
        // label configuration as health without performing a live probe.
        blockscout: providerConfiguration(Boolean(env.BLOCKSCOUT_API_BASE_URL)),
        alchemy: providerConfiguration(Boolean(env.ALCHEMY_ROBINHOOD_RPC_URL || env.ALCHEMY_API_KEY)),
        goldrush: providerConfiguration(env.GOLDRUSH_ENABLED && Boolean(env.GOLDRUSH_API_KEY))
      }
    };
    return ok ? { ok: true, ...status } : reply.status(503).send({ ok: false, ...status });
  });
}
