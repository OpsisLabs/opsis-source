import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import type { ControlsSource } from "../controls/service.js";
import { AppError } from "../http/errors.js";
const body = z
  .object({ contract: z.string().regex(/^0x[0-9a-fA-F]{40}$/) })
  .strict();
export async function controlsRoutes(
  app: FastifyInstance,
  env: Env,
  service: ControlsSource,
) {
  app.post(
    "/v1/private/opsis/controls",
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } },
    async (request, reply) => {
      reply.header("cache-control", "private, no-store");
      if (
        !env.OPSIS_WORKSPACES_ENABLED ||
        !env.TOKEN_CONTROLS_ENABLED ||
        !env.PRIVATE_MODE_ENABLED
      )
        throw new AppError("NOT_FOUND", 404, "Not found");
      return service.check(body.parse(request.body).contract);
    },
  );
}
