import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { AppError } from "../http/errors.js";
import {
  MarketInventoryService,
  type MarketInventorySource,
} from "../market/service.js";

const cryptoBody = z
  .object({
    chainId: z.literal(4663),
    contract: z
      .string()
      .trim()
      .regex(/^0x[0-9a-fA-F]{40}$/),
  })
  .strict();

const merchantBody = z
  .object({
    merchantId: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(/^[a-z0-9-]+$/),
    canonicalAssetId: z.string().trim().min(3).max(200),
    expectedSku: z.string().min(1).max(100),
    expectedProductId: z.string().regex(/^\d{1,20}$/),
    expectedMappingReviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export async function marketRoutes(
  app: FastifyInstance,
  env: Env,
  source: MarketInventorySource = new MarketInventoryService(env),
): Promise<void> {
  const config = {
    rateLimit: { max: env.RATE_LIMIT_MARKET_PER_HOUR, timeWindow: "1 hour" },
  };
  app.post(
    "/v1/private/market/merchants",
    { config },
    async (request, reply) => {
      noStore(reply);
      assertEnabled(env);
      z.object({}).strict().parse(request.body);
      return source.directory();
    },
  );
  app.post("/v1/private/market/crypto", { config }, async (request, reply) => {
    noStore(reply);
    assertEnabled(env);
    const input = cryptoBody.parse(request.body);
    return source.crypto(input.contract);
  });
  app.post(
    "/v1/private/market/merchant",
    { config },
    async (request, reply) => {
      noStore(reply);
      assertEnabled(env);
      const input = merchantBody.parse(request.body);
      return source.merchant(input.merchantId, input.canonicalAssetId, {
        sku: input.expectedSku,
        productId: input.expectedProductId,
        reviewedAt: input.expectedMappingReviewedAt,
      });
    },
  );
}

function assertEnabled(env: Env): void {
  if (!env.MARKET_INVENTORY_ENABLED) {
    throw new AppError(
      "MARKET_INVENTORY_DISABLED",
      503,
      "Market & Inventory is temporarily unavailable; saved local comparisons and handoffs still work",
    );
  }
}

function noStore(reply: {
  header(name: string, value: string): unknown;
}): void {
  reply.header("Cache-Control", "private, no-store");
  reply.header("Pragma", "no-cache");
}
