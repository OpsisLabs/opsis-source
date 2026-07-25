import type { FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../config/env.js";
import { AppError } from "./errors.js";
import { verifyAccessToken, type AccessClaims } from "../security/jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AccessClaims;
  }
}

export function authenticate(env: Env) {
  return async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) throw new AppError("UNAUTHORIZED", 401, "Missing bearer token");
    try {
      request.user = verifyAccessToken(env, auth.slice("Bearer ".length));
    } catch {
      throw new AppError("UNAUTHORIZED", 401, "Invalid or expired bearer token");
    }
  };
}

export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (request.user?.role !== "ADMIN") throw new AppError("FORBIDDEN", 403, "Administrator access is required");
}

export function rateLimitKey(request: FastifyRequest, env: Env): string {
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    try {
      return `user:${verifyAccessToken(env, auth.slice("Bearer ".length)).sub}`;
    } catch {
      return `ip:${request.ip}`;
    }
  }
  return `ip:${request.ip}`;
}
