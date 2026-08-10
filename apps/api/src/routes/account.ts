import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "../config/env.js";
import { AccountRepository } from "../account/repository.js";
import { authenticate } from "../http/authenticate.js";
import { AppError } from "../http/errors.js";
import { clearSessionCookies } from "../auth/cookies.js";
import { z } from "zod";

const deleteBody = z.object({ confirmation: z.literal("DELETE MY CHAINSCOUT ACCOUNT") }).strict();

export async function accountRoutes(app: FastifyInstance, env: Env, prisma?: PrismaClient): Promise<void> {
  const accounts = new AccountRepository(prisma);
  const preHandler = authenticate(env);

  app.get("/v1/account/export", { preHandler }, async (request, reply) => {
    if (!request.user) throw new AppError("UNAUTHORIZED", 401, "Authentication required");
    const exported = await accounts.exportUser(request.user.sub);
    if (!exported) throw new AppError("NOT_FOUND", 404, "Account was not found");
    const date = new Date().toISOString().slice(0, 10);
    reply.header("Cache-Control", "no-store, private");
    reply.header("Pragma", "no-cache");
    reply.header("Content-Disposition", `attachment; filename="chainscout-account-export-${date}.json"`);
    reply.type("application/json; charset=utf-8");
    return exported;
  });

  app.delete("/v1/account", { preHandler }, async (request, reply) => {
    if (!request.user) throw new AppError("UNAUTHORIZED", 401, "Authentication required");
    deleteBody.parse(request.body);
    await accounts.deleteUser(request.user.sub);
    clearSessionCookies(reply, env);
    return reply.status(204).send();
  });
}
