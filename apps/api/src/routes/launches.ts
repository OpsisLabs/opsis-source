import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { rateLimitKey } from "../http/authenticate.js";
import { AppError } from "../http/errors.js";
import { maxFeedMinutes, type LaunchCardsSource } from "../launches/service.js";
const query = z
  .object({
    minutes: z.coerce.number().int().min(1).max(maxFeedMinutes).default(10),
  })
  .strict();
const params = z
  .object({ token: z.string().regex(/^0x[0-9a-fA-F]{40}$/) })
  .strict();
export async function launchRoutes(
  app: FastifyInstance,
  env: Env,
  source: LaunchCardsSource,
) {
  // One limiter instance shares the local store across card and feed routes;
  // route-level stores in the plugin are independent without Redis.
  const limit = app.hasDecorator("rateLimit")
    ? app.rateLimit({
        max: env.RATE_LIMIT_LAUNCH_CARDS_PER_HOUR,
        timeWindow: "1 hour",
        keyGenerator: (request) => `${rateLimitKey(request, env)}:launch-cards`,
      })
    : undefined;
  const options = {
    config: { rateLimit: false as const },
    ...(limit ? { onRequest: limit } : {}),
  };
  const observed = async (
    read: () => Promise<unknown>,
    log: FastifyBaseLogger,
  ) => {
    try {
      return await read();
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 503) {
        const reason =
          (error.details as { reason?: string } | undefined)?.reason ??
          "PROVIDER_ERROR:UNKNOWN";
        log.warn({ reason }, "Launch facts refused");
        throw new AppError(error.code, 503, error.message, { reason });
      }
      throw error;
    }
  };
  const enabled = () => {
    if (
      !env.LAUNCH_CARDS_ENABLED ||
      !env.PRIVATE_MODE_ENABLED ||
      !env.OPSIS_WORKSPACES_ENABLED
    )
      throw new AppError("NOT_FOUND", 404, "Not found");
  };
  app.get("/v1/private/opsis/launches", options, async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    enabled();
    const minutes = query.parse(request.query).minutes;
    return observed(() => source.feed(minutes), request.log);
  });
  app.get(
    "/v1/private/opsis/launches/:token",
    options,
    async (request, reply) => {
      reply.header("cache-control", "private, no-store");
      enabled();
      z.object({}).strict().parse(request.query);
      const token = params.parse(request.params).token;
      return observed(() => source.card(token), request.log);
    },
  );
}
