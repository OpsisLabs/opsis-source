import type { FastifyInstance, FastifyRequest } from "fastify";
import { AuditService, type AuditAction } from "../audit/service.js";
import type { Env } from "../config/env.js";
import { authBodySchema, AuthService } from "../auth/service.js";
import { WalletAuthError, issueNonce } from "../auth/wallet.js";
import { z } from "zod";
import { AuthRepository } from "../auth/repository.js";
import { AuthEmailService } from "../auth/email.js";
import { authenticate } from "../http/authenticate.js";
import { AppError } from "../http/errors.js";
import { sha256 } from "../security/hash.js";
import type { PrismaClient } from "@prisma/client";
import { UsageService } from "../usage/service.js";
import { observeAuth } from "../observability/metrics.js";
import {
  clearSessionCookies,
  publicAuthResponse,
  readRefreshToken,
  setSessionCookies
} from "../auth/cookies.js";

export async function authRoutes(app: FastifyInstance, env: Env, prisma?: PrismaClient): Promise<void> {
  const service = new AuthService(env, new AuthRepository(prisma), new AuthEmailService(env));
  const audits = new AuditService(prisma);
  const usage = new UsageService(prisma);
  const authRateLimit = { config: { rateLimit: { max: env.RATE_LIMIT_AUTH_PER_HOUR, timeWindow: "1 hour" } } };

  async function recordAudit(
    request: FastifyRequest,
    action: AuditAction,
    userId?: string,
    metadata?: Record<string, string | number | boolean>
  ): Promise<void> {
    try {
      await audits.record({ action, userId, metadata, ip: request.ip, userAgent: request.headers["user-agent"] });
    } catch (error) {
      request.log.error({ err: error, action }, "audit log write failed");
    }
  }

  app.post("/v1/auth/register", authRateLimit, async (request, reply) => {
    const body = authBodySchema.parse(request.body);
    try {
      const result = await service.register(body.email, body.password, request.headers["user-agent"], request.ip);
      observeAuth("signup");
      await recordAudit(request, "AUTH_REGISTER_SUCCEEDED", result.user.id);
      setSessionCookies(reply, env, result);
      return publicAuthResponse(env, result);
    } catch (error) {
      if ((error as Error).message === "EMAIL_ALREADY_REGISTERED") {
        await recordAudit(request, "AUTH_REGISTER_REJECTED", undefined, { emailHash: sha256(body.email.toLowerCase()) });
        throw new AppError("EMAIL_ALREADY_REGISTERED", 409, "Email is already registered");
      }
      throw error;
    }
  });

  app.post("/v1/auth/login", authRateLimit, async (request, reply) => {
    const body = authBodySchema.parse(request.body);
    try {
      const result = await service.login(body.email, body.password, request.headers["user-agent"], request.ip);
      observeAuth("login");
      await recordAudit(request, "AUTH_LOGIN_SUCCEEDED", result.user.id);
      setSessionCookies(reply, env, result);
      return publicAuthResponse(env, result);
    } catch (error) {
      if ((error as Error).message === "INVALID_CREDENTIALS") {
        await recordAudit(request, "AUTH_LOGIN_FAILED", undefined, { emailHash: sha256(body.email.toLowerCase()) });
        throw new AppError("INVALID_CREDENTIALS", 401, "Invalid email or password");
      }
      if ((error as Error).message === "EMAIL_NOT_VERIFIED") {
        throw new AppError("EMAIL_NOT_VERIFIED", 403, "Email verification is required");
      }
      throw error;
    }
  });

  app.post("/v1/auth/verify-email", authRateLimit, async (request, reply) => {
    const body = zToken.parse(request.body);
    try {
      const result = await service.verifyEmail(body.token, request.headers["user-agent"], request.ip);
      await recordAudit(request, "AUTH_EMAIL_VERIFIED", result.user.id);
      setSessionCookies(reply, env, result);
      return publicAuthResponse(env, result);
    } catch (error) {
      if ((error as Error).message === "INVALID_AUTH_TOKEN") {
        throw new AppError("INVALID_AUTH_TOKEN", 400, "Verification token is invalid or expired");
      }
      throw error;
    }
  });

  app.post("/v1/auth/resend-verification", authRateLimit, async (request, reply) => {
    const body = authBodySchema.pick({ email: true }).parse(request.body);
    const verificationToken = await service.resendVerification(body.email);
    await recordAudit(request, "AUTH_VERIFICATION_REQUESTED", undefined, { emailHash: sha256(body.email.toLowerCase()) });
    return reply.status(202).send({ accepted: true, ...(verificationToken && env.NODE_ENV !== "production" ? { verificationToken } : {}) });
  });

  app.post("/v1/auth/forgot-password", authRateLimit, async (request, reply) => {
    const body = authBodySchema.pick({ email: true }).parse(request.body);
    const resetToken = await service.requestPasswordReset(body.email);
    await recordAudit(request, "AUTH_PASSWORD_RESET_REQUESTED", undefined, { emailHash: sha256(body.email.toLowerCase()) });
    return reply.status(202).send({ accepted: true, ...(resetToken ? { resetToken } : {}) });
  });

  app.post("/v1/auth/reset-password", authRateLimit, async (request) => {
    const body = authBodySchema.pick({ password: true }).extend({ token: zToken.shape.token }).parse(request.body);
    try {
      await service.resetPassword(body.token, body.password);
      await recordAudit(request, "AUTH_PASSWORD_RESET_COMPLETED");
      return { ok: true };
    } catch (error) {
      if ((error as Error).message === "INVALID_AUTH_TOKEN") {
        throw new AppError("INVALID_AUTH_TOKEN", 400, "Password reset token is invalid or expired");
      }
      throw error;
    }
  });

  app.post("/v1/auth/refresh", authRateLimit, async (request, reply) => {
    const body = z.object({ refreshToken: z.string().min(1).optional() }).strict().parse(request.body ?? {});
    const refreshToken = readRefreshToken(request, env) ?? (env.NODE_ENV === "test" ? body.refreshToken : undefined);
    if (!refreshToken) throw new AppError("UNAUTHORIZED", 401, "Refresh session is missing");
    try {
      const result = await service.refresh(refreshToken, request.headers["user-agent"], request.ip);
      await recordAudit(request, "AUTH_REFRESH_SUCCEEDED", result.user.id);
      setSessionCookies(reply, env, result);
      return publicAuthResponse(env, result);
    } catch (error) {
      if ((error as Error).message === "INVALID_REFRESH_TOKEN") {
        await recordAudit(request, "AUTH_REFRESH_FAILED");
        clearSessionCookies(reply, env);
        throw new AppError("INVALID_REFRESH_TOKEN", 401, "Invalid refresh token");
      }
      throw error;
    }
  });

  app.post("/v1/auth/logout", authRateLimit, async (request, reply) => {
    const body = z.object({ refreshToken: z.string().min(1).optional() }).strict().parse(request.body ?? {});
    const refreshToken = readRefreshToken(request, env) ?? (env.NODE_ENV === "test" ? body.refreshToken : undefined);
    const userId = refreshToken ? await service.logout(refreshToken) : undefined;
    await recordAudit(request, "AUTH_LOGOUT", userId, { tokenFound: Boolean(userId) });
    clearSessionCookies(reply, env);
    return { ok: true };
  });

  app.post("/v1/auth/wallet/nonce", authRateLimit, async (request) => {
    const body = z.object({ address: z.string().min(1).max(100) }).parse(request.body);
    try {
      return issueNonce(env, body.address);
    } catch (error) {
      if (error instanceof WalletAuthError) throw new AppError(error.code, 400, error.message);
      throw error;
    }
  });

  app.post("/v1/auth/wallet/verify", authRateLimit, async (request, reply) => {
    const body = z.object({
      nonce: z.string().min(1).max(2000),
      signature: z.string().min(1).max(500),
      username: z.string().min(1).max(50).optional()
    }).parse(request.body);
    try {
      const result = await service.loginWithWallet(
        body.nonce,
        body.signature,
        body.username,
        request.headers["user-agent"],
        request.ip
      );
      observeAuth("login");
      await recordAudit(request, "AUTH_LOGIN_SUCCEEDED", result.user.id, { method: "wallet" });
      setSessionCookies(reply, env, result);
      return publicAuthResponse(env, result);
    } catch (error) {
      if (error instanceof WalletAuthError) {
        // A new wallet needing a username is a prompt, not a failure; a malformed
        // username or address is bad input; only signature problems are auth failures.
        const status =
          error.code === "USERNAME_REQUIRED" || error.code === "USERNAME_TAKEN"
            ? 409
            : error.code === "INVALID_USERNAME" || error.code === "INVALID_ADDRESS"
              ? 400
              : 401;
        if (status === 401) await recordAudit(request, "AUTH_LOGIN_FAILED", undefined, { method: "wallet" });
        throw new AppError(error.code, status, error.message);
      }
      throw error;
    }
  });

  app.get("/v1/auth/me", { preHandler: authenticate(env, prisma) }, async (request) => {
    if (!request.user) throw new AppError("UNAUTHORIZED", 401, "Authentication required");
    const quota = await usage.forUser(request.user.sub, {
      aiMessages: env.QUOTA_AI_MESSAGES_PER_MONTH,
      chainLookups: env.QUOTA_CHAIN_LOOKUPS_PER_MONTH
    });
    return { user: request.user, quota };
  });
}

const zToken = authBodySchema.pick({}).extend({ token: authBodySchema.shape.password.min(20).max(500) });
