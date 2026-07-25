import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "../config/env.js";

type RedisHealth = { ping(): Promise<string> };

export async function healthRoutes(app: FastifyInstance, env: Env, prisma?: PrismaClient, redis?: RedisHealth): Promise<void> {
  app.get("/healthz", { config: { rateLimit: false } }, async () => ({ ok: true }));
  app.get("/readyz", { config: { rateLimit: false } }, async (_request, reply) => {
    const status = {
      database: prisma ? "up" : "memory",
      redis: redis ? "up" : "disabled",
      providers: {
        blockscout: true,
        alchemy: Boolean(env.ALCHEMY_ROBINHOOD_RPC_URL || env.ALCHEMY_API_KEY),
        goldrush: env.GOLDRUSH_ENABLED && Boolean(env.GOLDRUSH_API_KEY)
      }
    };
    try {
      if (prisma) await prisma.$queryRaw`SELECT 1`;
      if (redis && await redis.ping() !== "PONG") throw new Error("REDIS_NOT_READY");
      return { ok: true, ...status };
    } catch {
      return reply.status(503).send({ ok: false, ...status, database: prisma ? "unavailable" : status.database, redis: redis ? "unavailable" : status.redis });
    }
  });
}
