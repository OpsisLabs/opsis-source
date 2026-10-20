import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { AppError } from "../http/errors.js";
import type { StockDeskSource } from "../stock-desk/service.js";

export async function stockDeskRoutes(
  app: FastifyInstance,
  env: Env,
  source: StockDeskSource,
): Promise<void> {
  const guard = () => {
    if (
      !env.STOCK_DESK_ENABLED ||
      !env.RWA_VERIFY_ENABLED ||
      !env.EXIT_CHECK_ENABLED
    )
      throw new AppError(
        "STOCK_DESK_DISABLED",
        503,
        "Stock Token Desk unavailable",
      );
  };
  const config = {
    rateLimit: { max: env.RATE_LIMIT_RWA_PER_HOUR, timeWindow: "1 hour" },
  };
  app.post(
    "/v1/private/stock-desk/token",
    { config },
    async (request, reply) => {
      reply.header("Cache-Control", "private, no-store");
      guard();
      const { address } = z
        .object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) })
        .strict()
        .parse(request.body);
      return source.desk(address);
    },
  );
  app.post(
    "/v1/private/stock-desk/index",
    { config },
    async (request, reply) => {
      reply.header("Cache-Control", "private, no-store");
      guard();
      z.object({}).strict().parse(request.body);
      return source.index();
    },
  );
}
