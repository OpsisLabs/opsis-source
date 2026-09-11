import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { JsonCache } from "../cache/service.js";
import type { Env } from "../config/env.js";
import { AppError } from "../http/errors.js";
import { ExitCheckService, type ExitCheckSource } from "../exit-check/service.js";

const quoteBody = z.object({
  token: z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/),
  amount: z.string().min(1).max(80),
  outputToken: z.enum(["WETH", "USDG"]).optional()
}).strict();

export async function exitCheckRoutes(
  app: FastifyInstance,
  env: Env,
  cache: JsonCache,
  source?: ExitCheckSource
): Promise<void> {
  const service = source ?? new ExitCheckService(env, cache);

  app.post("/v1/private/exit-check/quote", {
    config: { rateLimit: { max: env.RATE_LIMIT_EXIT_CHECK_PER_HOUR, timeWindow: "1 hour" } }
  }, async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    if (!env.EXIT_CHECK_ENABLED) {
      // Hidden by default: an unshipped endpoint responds as if it does not
      // exist rather than advertising a disabled feature.
      throw new AppError("NOT_FOUND", 404, "Not found");
    }
    const body = quoteBody.parse(request.body);
    try {
      return await service.quote(body);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("EXIT_CHECK_UNAVAILABLE", 503, "The read-only exit estimate is temporarily unavailable");
    }
  });
}
