import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { AppError } from "../http/errors.js";
import { PortfolioService, type PortfolioSnapshotSource } from "../portfolio/service.js";

const snapshotBody = z.object({
  address: z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/)
}).strict();

export async function portfolioRoutes(
  app: FastifyInstance,
  env: Env,
  source: PortfolioSnapshotSource = new PortfolioService(env)
): Promise<void> {
  app.post(
    "/v1/private/portfolio/snapshot",
    {
      config: {
        rateLimit: { max: env.RATE_LIMIT_PORTFOLIO_PER_HOUR, timeWindow: "1 hour" }
      }
    },
    async (request, reply) => {
      reply.header("Cache-Control", "private, no-store");
      reply.header("Pragma", "no-cache");
      if (!env.PORTFOLIO_MODE_ENABLED) {
        throw new AppError("PORTFOLIO_MODE_DISABLED", 503, "Portfolio refresh is temporarily unavailable");
      }
      const { address } = snapshotBody.parse(request.body);
      return source.snapshot(address);
    }
  );
}
