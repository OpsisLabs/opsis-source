import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { AiService } from "../ai/service.js";
import { ChatRepository } from "../chat/repository.js";
import { ChainEntityResolver } from "../chain/resolver.js";
import type { JsonCache } from "../cache/service.js";
import { authenticate } from "../http/authenticate.js";
import { AppError } from "../http/errors.js";
import { UsageService } from "../usage/service.js";
import type { PrismaClient } from "@prisma/client";

const createSessionBody = z.object({
  title: z.string().min(1).max(120).default("New analysis"),
  initialEntity: z.string().min(1).max(200).optional()
});

const sendBody = z.object({
  question: z.string().min(1).max(2000).optional(),
  message: z.string().min(1).max(2000).optional(),
  entity: z.string().min(1).max(200).optional(),
  entityType: z.enum(["wallet", "transaction", "token", "contract", "block", "unknown"]).optional()
}).refine((body) => Boolean(body.question ?? body.message), { message: "question or message is required" });

export async function chatRoutes(app: FastifyInstance, env: Env, prisma?: PrismaClient, cache?: JsonCache): Promise<void> {
  const ai = new AiService(env);
  const resolver = new ChainEntityResolver(env, cache, prisma);
  const chats = new ChatRepository(prisma);
  const usage = new UsageService(prisma);
  const preHandler = authenticate(env);
  const quota = { aiMessages: env.QUOTA_AI_MESSAGES_PER_MONTH, chainLookups: env.QUOTA_CHAIN_LOOKUPS_PER_MONTH };

  app.post("/v1/chat/sessions", { preHandler }, async (request) => {
    const body = createSessionBody.parse(request.body ?? {});
    if (!request.user) throw new AppError("UNAUTHORIZED", 401, "Authentication required");
    if (body.initialEntity) await usage.assertAvailable(request.user.sub, "CHAIN_LOOKUP", quota);
    const resolution = body.initialEntity ? await resolver.resolveWithSources("unknown", body.initialEntity) : undefined;
    const session = await chats.createSession(request.user.sub, body.title, resolution);
    if (resolution) await usage.record(request.user.sub, "CHAIN_LOOKUP");
    const entity = resolution ? { type: resolution.entity.type, chainId: resolution.entity.chainId, id: resolution.entity.value } : null;
    return { session, id: session.id, title: session.title, entity };
  });

  app.get("/v1/chat/sessions", { preHandler }, async (request) => {
    if (!request.user) throw new AppError("UNAUTHORIZED", 401, "Authentication required");
    return { sessions: await chats.listSessions(request.user.sub) };
  });

  app.get("/v1/chat/sessions/:sessionId/messages", { preHandler }, async (request) => {
    if (!request.user) throw new AppError("UNAUTHORIZED", 401, "Authentication required");
    const { sessionId } = z.object({ sessionId: z.string() }).parse(request.params);
    const messages = await chats.listMessages(sessionId, request.user.sub);
    if (!messages) throw new AppError("NOT_FOUND", 404, "Chat session not found");
    return { messages };
  });

  app.post(
    "/v1/chat/sessions/:sessionId/messages",
    { preHandler, config: { rateLimit: { max: env.RATE_LIMIT_CHAT_PER_HOUR, timeWindow: "1 hour" } } },
    async (request) => {
      if (!request.user) throw new AppError("UNAUTHORIZED", 401, "Authentication required");
      const { sessionId } = z.object({ sessionId: z.string() }).parse(request.params);
      const body = sendBody.parse(request.body);
      if (!(await chats.ownsSession(sessionId, request.user.sub))) {
        throw new AppError("NOT_FOUND", 404, "Chat session not found");
      }
      await Promise.all([
        usage.assertAvailable(request.user.sub, "CHAIN_LOOKUP", quota),
        usage.assertAvailable(request.user.sub, "AI_MESSAGE", quota)
      ]);
      const activeEntity = body.entity
        ? { type: body.entityType ?? "unknown", value: body.entity }
        : await chats.activeEntity(sessionId, request.user.sub);
      if (!activeEntity) throw new AppError("ENTITY_REQUIRED", 400, "Provide an entity or create the session with an initial entity");
      const question = body.question ?? body.message!;
      const providerStartedAt = performance.now();
      const resolution = await resolver.resolveWithSources(activeEntity.type, activeEntity.value);
      const providerLatencyMs = performance.now() - providerStartedAt;
      const aiStartedAt = performance.now();
      const answer = await ai.answer(question, resolution.entity);
      const aiLatencyMs = performance.now() - aiStartedAt;
      const message = await chats.addExchange(sessionId, request.user.sub, question, answer, resolution);
      if (!message) throw new AppError("NOT_FOUND", 404, "Chat session not found");
      await Promise.all([
        usage.record(request.user.sub, "CHAIN_LOOKUP"),
        usage.record(request.user.sub, "AI_MESSAGE")
      ]);
      request.log.info({
        userId: request.user.sub,
        providerNames: [...new Set(resolution.sources.map((source) => source.provider))],
        providerLatencyMs,
        aiLatencyMs,
        usage: { chainLookups: 1, aiMessages: 1 }
      }, "chat analysis completed");
      return { message, messageId: message.id, ...answer, answer };
    }
  );
}
