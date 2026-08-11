import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { AppError } from "../http/errors.js";
import { CollectibleCatalogService, type CollectibleCatalogSource } from "../collectibles/service.js";

const language = z.literal("en");
const searchBody = z.object({
  language,
  name: z.string().trim().min(2).max(80),
  number: z.string().trim().max(24).optional(),
  setId: z.string().trim().max(32).optional()
}).strict();
const detailBody = z.object({
  language,
  cardId: z.string().trim().min(1).max(80)
}).strict();

export async function collectibleRoutes(
  app: FastifyInstance,
  env: Env,
  source: CollectibleCatalogSource = new CollectibleCatalogService(env)
): Promise<void> {
  const config = { rateLimit: { max: env.RATE_LIMIT_COLLECTIBLE_PER_HOUR, timeWindow: "1 hour" } };
  app.post("/v1/private/collectibles/search", { config }, async (request, reply) => {
    noStore(reply);
    assertEnabled(env);
    return source.search(searchBody.parse(request.body));
  });
  app.post("/v1/private/collectibles/detail", { config }, async (request, reply) => {
    noStore(reply);
    assertEnabled(env);
    return source.detail(detailBody.parse(request.body));
  });
}

function assertEnabled(env: Env): void {
  if (!env.COLLECTIBLE_CATALOG_ENABLED) {
    throw new AppError("COLLECTIBLE_CATALOG_DISABLED", 503, "Collectible Catalog is temporarily unavailable; the manual Vault path remains available");
  }
}

function noStore(reply: { header(name: string, value: string): unknown }): void {
  reply.header("Cache-Control", "private, no-store");
  reply.header("Pragma", "no-cache");
}
