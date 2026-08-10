import type { FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../config/env.js";
import type { AuthResult, RegistrationResult } from "./service.js";

type SessionResult = AuthResult | RegistrationResult;

export function accessCookieName(env: Env): string {
  return env.NODE_ENV === "production" ? "__Host-chainscout_access" : "chainscout_access";
}

export function refreshCookieName(env: Env): string {
  return env.NODE_ENV === "production" ? "__Host-chainscout_refresh" : "chainscout_refresh";
}

export function readAccessToken(request: FastifyRequest, env: Env): string | undefined {
  return request.cookies?.[accessCookieName(env)];
}

export function readRefreshToken(request: FastifyRequest, env: Env): string | undefined {
  return request.cookies?.[refreshCookieName(env)];
}

export function setSessionCookies(reply: FastifyReply, env: Env, result: SessionResult): void {
  if (!result.accessToken || !result.refreshToken) return;
  const common = {
    path: "/",
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict" as const
  };
  reply.setCookie(accessCookieName(env), result.accessToken, {
    ...common,
    maxAge: durationSeconds(env.ACCESS_TOKEN_TTL, 15 * 60)
  });
  reply.setCookie(refreshCookieName(env), result.refreshToken, {
    ...common,
    maxAge: durationSeconds(env.REFRESH_TOKEN_TTL, 30 * 24 * 60 * 60)
  });
}

export function clearSessionCookies(reply: FastifyReply, env: Env): void {
  const options = {
    path: "/",
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict" as const
  };
  reply.clearCookie(accessCookieName(env), options);
  reply.clearCookie(refreshCookieName(env), options);
}

/** Browser runtimes never receive a credential in JSON. Test-only bearer
 * fixtures retain the token fields so the non-browser compatibility surface
 * remains covered without weakening the deployed transport. */
export function publicAuthResponse(env: Env, result: SessionResult): Record<string, unknown> {
  const response: Record<string, unknown> = { user: result.user };
  if ("verificationRequired" in result) response.verificationRequired = result.verificationRequired;
  if (env.NODE_ENV === "test") {
    if (result.accessToken) response.accessToken = result.accessToken;
    if (result.refreshToken) response.refreshToken = result.refreshToken;
    if ("verificationToken" in result && result.verificationToken) response.verificationToken = result.verificationToken;
  }
  return response;
}

function durationSeconds(value: string, fallback: number): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim().toLowerCase());
  if (!match) return fallback;
  const quantity = Number(match[1]);
  const multiplier = match[2] === "d" ? 86_400 : match[2] === "h" ? 3_600 : match[2] === "m" ? 60 : 1;
  return quantity * multiplier;
}
