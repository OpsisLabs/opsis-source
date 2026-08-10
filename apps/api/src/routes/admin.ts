import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { authenticate, requireAdmin } from "../http/authenticate.js";

export async function adminRoutes(app: FastifyInstance, env: Env, prisma?: PrismaClient): Promise<void> {
  app.get("/v1/admin/status", { preHandler: [authenticate(env, prisma), requireAdmin] }, async () => ({
    storage: prisma ? "postgresql" : "memory",
    services: {
      redis: Boolean(env.REDIS_URL),
      alchemy: Boolean(env.ALCHEMY_ROBINHOOD_RPC_URL || env.ALCHEMY_API_KEY),
      uniswap: env.UNISWAP_QUOTE_ENABLED && Boolean(env.UNISWAP_API_KEY),
      goldrush: env.GOLDRUSH_ENABLED && Boolean(env.GOLDRUSH_API_KEY),
      openai: Boolean(env.OPENAI_API_KEY),
      ollama: env.AI_PROVIDER === "ollama",
      aiProvider: env.AI_PROVIDER === "auto" ? (env.OPENAI_API_KEY ? "openai" : "fallback") : env.AI_PROVIDER,
      smtp: Boolean(env.SMTP_HOST && env.EMAIL_FROM),
      metrics: env.ENABLE_METRICS,
      retention: Boolean(prisma && env.RETENTION_ENABLED)
    },
    retentionDays: {
      auth: env.RETENTION_AUTH_DAYS,
      sources: env.RETENTION_SOURCE_DAYS,
      audit: env.RETENTION_AUDIT_DAYS,
      usage: env.RETENTION_USAGE_DAYS,
      chats: env.RETENTION_CHAT_DAYS
    }
  }));
}
