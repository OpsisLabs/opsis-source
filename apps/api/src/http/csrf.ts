import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { AppError } from "./errors.js";

declare module "fastify" {
  interface FastifyContextConfig {
    credentiallessPublic?: boolean;
  }
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function installCsrfProtection(app: FastifyInstance, env: Env): void {
  const enabled = env.NODE_ENV === "production" || env.CSRF_PROTECTION_ENABLED === true;
  if (!enabled) return;
  const allowedOrigins = new Set([new URL(env.APP_ORIGIN).origin, ...env.APP_ORIGIN_ALIAS_LIST]);

  app.addHook("onRequest", async (request) => {
    if (!MUTATING.has(request.method)) return;
    if (request.routeOptions.config?.credentiallessPublic === true) {
      // The exact route owns kill-switch, dedicated cap, credentials, and
      // content-type ordering in its route-level onRequest guard. Keeping this
      // exemption typed and exact prevents rejected traffic from bypassing the
      // dedicated anonymous safety cap.
      return;
    }
    const origin = request.headers.origin;
    if (!origin || !allowedOrigins.has(origin)) {
      throw new AppError("CSRF_ORIGIN_REJECTED", 403, "Request origin was not accepted");
    }
    if (request.headers["sec-fetch-site"] === "cross-site") {
      throw new AppError("CSRF_SITE_REJECTED", 403, "Cross-site request was not accepted");
    }
    if (request.headers["x-opsis-csrf"] !== "1") {
      throw new AppError("CSRF_HEADER_REQUIRED", 403, "Request confirmation header is required");
    }
    const contentType = request.headers["content-type"] ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      throw new AppError("JSON_REQUIRED", 415, "State-changing requests require JSON");
    }
  });
}
