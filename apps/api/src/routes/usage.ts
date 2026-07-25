import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { authenticate } from "../http/authenticate.js";
import { AppError } from "../http/errors.js";
import { UsageService } from "../usage/service.js";
import type { PrismaClient } from "@prisma/client";

export async function usageRoutes(app: FastifyInstance, env: Env, prisma?: PrismaClient): Promise<void> {
  const usage = new UsageService(prisma);
  app.get("/v1/usage/me", { preHandler: authenticate(env) }, async (request) => {
    if (!request.user) throw new AppError("UNAUTHORIZED", 401, "Authentication required");
    const result = await usage.forUser(request.user.sub, {
      aiMessages: env.QUOTA_AI_MESSAGES_PER_MONTH,
      chainLookups: env.QUOTA_CHAIN_LOOKUPS_PER_MONTH
    });
    return { ...result, usage: result };
  });
}
