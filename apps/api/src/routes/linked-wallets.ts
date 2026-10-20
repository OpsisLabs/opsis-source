import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { rateLimitKey } from "../http/authenticate.js";
import { AppError } from "../http/errors.js";
import type { LinkedWalletsSource } from "../linked-wallets/service.js";

export async function linkedWalletsRoutes(
  app: FastifyInstance,
  env: Env,
  source: LinkedWalletsSource,
) {
  const limit = app.hasDecorator("rateLimit")
    ? app.rateLimit({
        max: env.RATE_LIMIT_LINKED_WALLETS_PER_HOUR,
        timeWindow: "1 hour",
        keyGenerator: (request) =>
          `${rateLimitKey(request, env)}:linked-wallets`,
      })
    : undefined;
  app.get(
    "/v1/private/opsis/linked-wallets/:token",
    {
      schema: { hide: true },
      config: { rateLimit: false },
      ...(limit ? { onRequest: limit } : {}),
    },
    async (request, reply) => {
      reply.header("cache-control", "private, no-store");
      if (
        !env.LINKED_WALLETS_ENABLED ||
        !env.PRIVATE_MODE_ENABLED ||
        !env.OPSIS_WORKSPACES_ENABLED
      )
        throw new AppError("NOT_FOUND", 404, "Not found");
      z.object({}).strict().parse(request.query);
      const { token } = z
        .object({ token: z.string().regex(/^0x[0-9a-fA-F]{40}$/) })
        .strict()
        .parse(request.params);
      return source.graph(token);
    },
  );
}
