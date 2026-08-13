import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { observeOperationalFailure, observeRateLimit } from "../observability/metrics.js";
import { ProviderRequestError } from "../chain/provider-http.js";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | ZodError | AppError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: error.flatten() },
        requestId: request.id
      });
    }
    if (error instanceof AppError) {
      if (error.statusCode === 429) observeRateLimit(request.routeOptions.url ?? "unmatched");
      if (error.statusCode === 429 || error.statusCode >= 500) {
        observeOperationalFailure(error.code, error.statusCode);
      }
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
        requestId: request.id
      });
    }
    if (error instanceof ProviderRequestError) {
      const statusCode = error.code === "PROVIDER_HTTP_404" ? 404 : 503;
      if (statusCode >= 500) observeOperationalFailure(error.code, statusCode);
      return reply.status(statusCode).send({
        error: {
          code: statusCode === 404 ? "NOT_FOUND" : error.code,
          message: statusCode === 404 ? "Entity was not found on Robinhood Chain" : "Chain data provider is temporarily unavailable"
        },
        requestId: request.id
      });
    }
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      if (error.statusCode === 429) observeRateLimit(request.routeOptions.url ?? "unmatched");
      return reply.status(error.statusCode).send({
        error: {
          code: error.statusCode === 429 ? "RATE_LIMIT_EXCEEDED" : error.code || "REQUEST_ERROR",
          message: error.message
        },
        requestId: request.id
      });
    }
    request.log.error({ err: error }, "unhandled error");
    observeOperationalFailure("INTERNAL_ERROR", 500);
    return reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
      requestId: request.id
    });
  });
}
