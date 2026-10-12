import type { FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { Env } from "../config/env.js";
import { AppError } from "./errors.js";
import { verifyAccessToken, type AccessClaims } from "../security/jwt.js";
import { readAccessToken } from "../auth/cookies.js";
import { memoryStore } from "../db/memory.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AccessClaims;
  }
}

export function authenticate(env: Env, prisma?: PrismaClient) {
  return async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const auth = request.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : readAccessToken(request, env);
    if (!token) throw new AppError("UNAUTHORIZED", 401, "Authentication required");
    try {
      const claims = verifyAccessToken(env, token);
      const active = prisma
        ? await prisma.user.findFirst({ where: { id: claims.sub, status: "ACTIVE" }, select: { id: true } })
        : memoryStore.users.get(claims.sub)?.status === "ACTIVE";
      if (!active) throw new Error("inactive account");
      request.user = claims;
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
  const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : readAccessToken(request, env);
  if (token) {
    try {
      return privateRateLimitKey("user", verifyAccessToken(env, token).sub, env);
    } catch {
      return privateRateLimitKey("ip", rateLimitClientAddress(request), env);
    }
  }
  return privateRateLimitKey("ip", rateLimitClientAddress(request), env);
}

export function rateLimitClientAddress(request: FastifyRequest): string {
  const socketAddress = normalizeIp(request.raw?.socket?.remoteAddress ?? request.ip);
  const railwayAddress = request.headers["x-real-ip"];
  if (isTrustedProxyAddress(socketAddress) && typeof railwayAddress === "string") {
    const normalized = normalizeIp(railwayAddress);
    if (isIP(normalized)) return normalized;
  }
  return socketAddress;
}

function normalizeIp(value: string): string {
  const address = value.trim().toLowerCase();
  return address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
}

function isTrustedProxyAddress(address: string): boolean {
  if (address === "::1") return true;
  if (isIP(address) === 4) {
    return address.startsWith("127.") || address.startsWith("169.254.") || address.startsWith("100.");
  }
  return address.startsWith("fe80:") || address.startsWith("fc") || address.startsWith("fd");
}

function privateRateLimitKey(kind: "ip" | "user", value: string, env: Env): string {
  const digest = createHmac("sha256", env.JWT_ACCESS_SECRET)
    .update(`opsis:rate-limit:${kind}:${value.trim().toLowerCase()}`)
    .digest("hex");
  return `${kind}:${digest}`;
}
