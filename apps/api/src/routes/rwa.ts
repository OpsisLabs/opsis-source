import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { AppError } from "../http/errors.js";
import { RwaService, type RwaVerificationSource } from "../rwa/service.js";

const verifyBody = z.object({
  address: z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/)
}).strict();

export async function rwaRoutes(
  app: FastifyInstance,
  env: Env,
  source: RwaVerificationSource = new RwaService(env)
): Promise<void> {
  app.post(
    "/v1/private/rwa/verify",
    { config: { rateLimit: { max: env.RATE_LIMIT_RWA_PER_HOUR, timeWindow: "1 hour" } } },
    async (request, reply) => {
      reply.header("Cache-Control", "private, no-store");
      reply.header("Pragma", "no-cache");
      if (!env.RWA_VERIFY_ENABLED) throw new AppError("RWA_VERIFY_DISABLED", 503, "RWA verification is temporarily unavailable");
      const { address } = verifyBody.parse(request.body);
      return source.verify(address);
    }
  );
}
