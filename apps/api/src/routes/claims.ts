import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { launchpads, claimTypes } from "@rh-chain/shared";
import type { Env } from "../config/env.js";
import { AppError } from "../http/errors.js";
import { rateLimitKey } from "../http/authenticate.js";
import type { ClaimSource } from "../claims/service.js";
const percent = z
  .string()
  .regex(/^\d{1,3}(?:\.\d{1,6})?$/)
  .refine((n) => Number(n) <= 100);
export const claimSchema = z.union([
  z
    .object({
      type: z.enum(["ownership", "paused", "lpBurned", "verified"]),
      expected: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.enum(["top10", "deployer"]),
      comparison: z.enum(["under", "over", "equal"]),
      percent,
    })
    .strict(),
  z
    .object({ type: z.literal("launchpad"), launchpad: z.enum(launchpads) })
    .strict(),
  z
    .object({
      type: z.literal("tax"),
      buy: percent.nullable(),
      sell: percent.nullable(),
    })
    .strict(),
  z.object({ type: z.literal("unsupported") }).strict(),
  z
    .object({
      type: z
        .string()
        .max(64)
        .regex(/^[a-z][a-z0-9_]*$/i)
        .refine(
          (type) => !claimTypes.includes(type as (typeof claimTypes)[number]),
        ),
    })
    .strict()
    .transform(() => ({ type: "unsupported" as const })),
]);
export const claimRequestSchema = z
  .object({
    confirmed: z.literal(true),
    address: z
      .string()
      .regex(/^0x[\da-f]{40}$/i)
      .refine((a) => !/^0x0{40}$/i.test(a)),
    claims: z.array(claimSchema).min(1).max(32),
    postTime: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export async function claimRoutes(
  app: FastifyInstance,
  env: Env,
  source: ClaimSource,
) {
  app.post(
    "/v1/private/opsis/claims",
    {
      bodyLimit: 16_000,
      config: {
        rateLimit: {
          max: env.RATE_LIMIT_CLAIM_CHECK_PER_HOUR,
          timeWindow: "1 hour",
          keyGenerator: (request) => `${rateLimitKey(request, env)}:claims`,
        },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "private, no-store");
      if (
        !env.CLAIM_CHECK_ENABLED ||
        !env.PRIVATE_MODE_ENABLED ||
        !env.OPSIS_WORKSPACES_ENABLED
      )
        throw new AppError("NOT_FOUND", 404, "Not found");
      return source.check(claimRequestSchema.parse(request.body));
    },
  );
}
