import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import type { ReceiptService } from "../receipts/service.js";
import { AppError } from "../http/errors.js";
export async function receiptRoutes(app: FastifyInstance, env: Env, service?: ReceiptService) {
  app.get("/v1/private/opsis/receipts/keys", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
    if (!env.OPSIS_WORKSPACES_ENABLED || !env.PRIVATE_MODE_ENABLED || !env.RECEIPTS_ENABLED || !service) throw new AppError("NOT_FOUND", 404, "Not found");
    return service.keys.map(({ address, validFrom, validTo }) => ({ address, validFrom, validTo }));
  });
}
