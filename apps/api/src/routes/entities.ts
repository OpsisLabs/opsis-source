import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { authenticate } from "../http/authenticate.js";
import { ChainEntityResolver } from "../chain/resolver.js";
import type { JsonCache } from "../cache/service.js";
import { persistResolution } from "../chain/persistence.js";
import { UsageService } from "../usage/service.js";
import type { PrismaClient } from "@prisma/client";

const resolveBody = z.object({
  input: z.string().min(1).max(200),
  type: z.enum(["wallet", "transaction", "token", "contract", "block", "unknown"]).optional()
});
const resolveQuery = z.object({ q: z.string().min(1).max(200) });
const walletQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  includeApprovals: z.preprocess((value) => value === undefined ? true : value === "true" || value === true, z.boolean()),
  refresh: z.preprocess((value) => value === undefined ? false : value === "true" || value === true, z.boolean())
});

export async function entityRoutes(app: FastifyInstance, env: Env, prisma?: PrismaClient, cache?: JsonCache): Promise<void> {
  const resolver = new ChainEntityResolver(env, cache, prisma);
  const usage = new UsageService(prisma);
  const preHandler = authenticate(env);
  const quota = { aiMessages: env.QUOTA_AI_MESSAGES_PER_MONTH, chainLookups: env.QUOTA_CHAIN_LOOKUPS_PER_MONTH };

  async function resolve(type: Parameters<ChainEntityResolver["resolveWithSources"]>[0], value: string) {
    const resolution = await resolver.resolveWithSources(type, value);
    if (prisma) await persistResolution(prisma, resolution);
    return resolution.entity;
  }

  app.post("/v1/entities/resolve", { preHandler }, async (request) => {
    const body = resolveBody.parse(request.body);
    await usage.assertAvailable(request.user!.sub, "CHAIN_LOOKUP", quota);
    const entity = await resolve(body.type ?? "unknown", body.input);
    await usage.record(request.user?.sub, "CHAIN_LOOKUP");
    return { entity };
  });

  app.get("/v1/entities/resolve", { preHandler }, async (request) => {
    const { q } = resolveQuery.parse(request.query);
    await usage.assertAvailable(request.user!.sub, "CHAIN_LOOKUP", quota);
    const entity = await resolve("unknown", q);
    await usage.record(request.user?.sub, "CHAIN_LOOKUP");
    return { query: q, entity };
  });

  app.get("/v1/transactions/:hash", { preHandler }, async (request) => {
    const { hash } = z.object({ hash: z.string() }).parse(request.params);
    await usage.assertAvailable(request.user!.sub, "CHAIN_LOOKUP", quota);
    const entity = await resolve("transaction", hash);
    await usage.record(request.user?.sub, "CHAIN_LOOKUP");
    return { entity };
  });

  app.get("/v1/wallets/:address/summary", {
    preHandler,
    config: { rateLimit: { max: env.RATE_LIMIT_WALLET_PER_HOUR, timeWindow: "1 hour" } }
  }, async (request) => {
    const { address } = z.object({ address: z.string() }).parse(request.params);
    const query = walletQuery.parse(request.query);
    await usage.assertAvailable(request.user!.sub, "CHAIN_LOOKUP", quota);
    const resolution = await resolver.resolveWithSources("wallet", address, query);
    if (prisma) await persistResolution(prisma, resolution);
    const entity = resolution.entity;
    await usage.record(request.user?.sub, "CHAIN_LOOKUP");
    return { entity };
  });

  app.get("/v1/tokens/:address", { preHandler }, async (request) => {
    const { address } = z.object({ address: z.string() }).parse(request.params);
    await usage.assertAvailable(request.user!.sub, "CHAIN_LOOKUP", quota);
    const entity = await resolve("token", address);
    await usage.record(request.user?.sub, "CHAIN_LOOKUP");
    return { entity };
  });

  app.get("/v1/contracts/:address", { preHandler }, async (request) => {
    const { address } = z.object({ address: z.string() }).parse(request.params);
    await usage.assertAvailable(request.user!.sub, "CHAIN_LOOKUP", quota);
    const entity = await resolve("contract", address);
    await usage.record(request.user?.sub, "CHAIN_LOOKUP");
    return { entity };
  });
}
