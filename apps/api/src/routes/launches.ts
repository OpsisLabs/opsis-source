import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { rateLimitKey } from "../http/authenticate.js";
import { AppError } from "../http/errors.js";
import type { LaunchCardsSource } from "../launches/service.js";
const query = z
  .object({ minutes: z.coerce.number().int().min(1).max(120).default(30) })
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
    return source.feed(query.parse(request.query).minutes);
  });
  app.get(
    "/v1/private/opsis/launches/:token",
    options,
    async (request, reply) => {
      reply.header("cache-control", "private, no-store");
      enabled();
      z.object({}).strict().parse(request.query);
      return source.card(params.parse(request.params).token);
    },
  );
}
