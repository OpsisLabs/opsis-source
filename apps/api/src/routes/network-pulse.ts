import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { AppError } from "../http/errors.js";
import type { NetworkPulseService } from "../network-pulse/service.js";
import { authorizeOpsisPreview } from "./opsis.js";

export async function networkPulseRoutes(app: FastifyInstance, env: Env, service: Pick<NetworkPulseService, "observe">) {
  app.get("/v1/private/opsis/network-pulse", {
    config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    if (!env.NETWORK_PULSE_ENABLED || !env.OPSIS_WORKSPACES_ENABLED) throw new AppError("NOT_FOUND", 404, "Not found");
    authorizeOpsisPreview(env, request.headers.authorization);
    return service.observe();
  });
}
