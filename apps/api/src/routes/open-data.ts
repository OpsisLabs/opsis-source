import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type Redis from "ioredis";
import type { TokenCardSource } from "../cards/service.js";
import { publicCardRoutes, reachResponseHeaders } from "./public-cards.js";
import type { Env } from "../config/env.js";
import { rateLimitClientAddress } from "../http/authenticate.js";
import { AppError } from "../http/errors.js";
import { createOpenDataLimiter, type OpenDataLimiter } from "../open-data/limiter.js";
import {
  listOpenDataAssets,
  normalizeBody,
  normalizeOpenDataIdentity,
  openDataManifest,
} from "../open-data/registry.js";

function requireEnabled(env: Env): void {
  if (!env.OPEN_DATA_API_ENABLED) {
    throw new AppError("OPEN_DATA_API_DISABLED", 503, "The Open Data API is not enabled in this build");
  }
}

type OpenDataClass = "opsis-reviewed-reference" | "opsis-derived-normalization";

function sendPublic(reply: FastifyReply, body: unknown, dataClass: OpenDataClass) {
  reply.header("cache-control", "private, no-store");
  reply.header("x-opsis-data-class", dataClass);
  return reply.send(body);
}

export async function openDataRoutes(
  app: FastifyInstance,
  env: Env,
  redis?: Redis,
  limiter?: OpenDataLimiter,
  cards?: TokenCardSource,
): Promise<void> {
  const activeLimiter = limiter ?? createOpenDataLimiter(env, redis);
  if (cards) await app.register(async (scope) => {
    reachResponseHeaders(scope);
    await publicCardRoutes(scope, env, activeLimiter, cards);
  });
  const routeConfig = {
    cors: false,
    rateLimit: false as const,
    credentiallessPublic: true,
  };

  async function consume(request: FastifyRequest, reply: FastifyReply) {
    requireEnabled(env);
    let result;
    try {
      result = await activeLimiter.consume(rateLimitClientAddress(request));
    } catch (error) {
      if (error instanceof AppError && error.code === "OPEN_DATA_RATE_LIMIT_EXCEEDED") {
        const details = error.details as { retryAfterSeconds?: unknown } | undefined;
        if (typeof details?.retryAfterSeconds === "number") reply.header("retry-after", details.retryAfterSeconds);
      }
      throw error;
    }
    reply.header("ratelimit-limit", result.limit);
    reply.header("ratelimit-remaining", result.remaining);
    reply.header("ratelimit-reset", result.resetSeconds);
  }

  async function guard(request: FastifyRequest, reply: FastifyReply, requiresJson: boolean) {
    reply.header("cache-control", "private, no-store");
    requireEnabled(env);
    await consume(request, reply);
    if (request.headers.cookie || request.headers.authorization) {
      throw new AppError("PUBLIC_CREDENTIALS_REJECTED", 400, "This public route does not accept account credentials");
    }
    if (requiresJson && (request.headers["content-type"] ?? "").split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
      throw new AppError("JSON_REQUIRED", 415, "This public route requires JSON");
    }
  }

  app.get("/v1/public/open-data/v1/registry", {
    config: routeConfig,
    onRequest: (request, reply) => guard(request, reply, false),
  }, async (_request, reply) => {
    const body = listOpenDataAssets(env.BUILD_SHA ?? env.RAILWAY_GIT_COMMIT_SHA ?? null);
    return sendPublic(reply, {
      ...body,
      cap: openDataManifest(env.RATE_LIMIT_OPEN_DATA_PER_HOUR).cap,
    }, "opsis-reviewed-reference");
  });

  app.post("/v1/public/open-data/v1/normalize", {
    config: routeConfig,
    bodyLimit: 128,
    onRequest: (request, reply) => guard(request, reply, true),
  }, async (request, reply) => {
    const body = normalizeBody.parse(request.body);
    const identity = normalizeOpenDataIdentity(body);
    if (!identity) throw new AppError("OPEN_DATA_INVALID_IDENTITY", 400, "The public identifier does not match the selected syntax");
    return sendPublic(reply, identity, "opsis-derived-normalization");
  });
}
