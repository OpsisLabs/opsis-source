import type { FastifyInstance } from "fastify";
import type { AiExplorerAnswer, ChainEntityType, NormalizedEntity } from "@rh-chain/shared";
import type { Env } from "../config/env.js";
import type { JsonCache } from "../cache/service.js";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AiService } from "../ai/service.js";
import { ChainEntityResolver } from "../chain/resolver.js";
import type { ResolvedEntity } from "../chain/types.js";
import type { ResolveOptions } from "../chain/types.js";
import { AppError } from "../http/errors.js";

const analyzeBody = z.object({
  entity: z.string().trim().min(1).max(200),
  entityType: z.enum(["wallet", "transaction", "token", "contract", "block", "unknown"]).default("unknown"),
  question: z.string().trim().min(1).max(500).optional()
}).strict();

export type PrivateAnalysisDependencies = {
  resolve(type: ChainEntityType, value: string, options: ResolveOptions): Promise<ResolvedEntity>;
  answer(question: string, entity: NormalizedEntity): Promise<AiExplorerAnswer>;
};

export function privateResolverEnvironment(env: Env): Env {
  return {
    ...env,
    // Blockscout's public API can independently rate-limit or challenge a
    // server request. Private Mode still needs a useful read-only answer in
    // that case, so its bounded resolver may fall back to Robinhood's official
    // public RPC for code and native-balance reads. This override is scoped to
    // the ephemeral route and does not enable the legacy app-wide fallback.
    ENABLE_PUBLIC_RPC_FALLBACK: true,
    PROVIDER_MAX_RETRIES: 0,
    PROVIDER_TIMEOUT_MS: Math.min(env.PROVIDER_TIMEOUT_MS, 8_000)
  };
}

export async function privateRoutes(
  app: FastifyInstance,
  env: Env,
  prisma?: PrismaClient,
  cache?: JsonCache,
  dependencies?: PrivateAnalysisDependencies
): Promise<void> {
  // The private first-look path is deliberately bounded: one attempt per
  // public provider call and an eight-second ceiling. A slow optional upstream
  // should degrade promptly instead of trapping a beginner behind retry loops.
  const privateResolverEnv = privateResolverEnvironment(env);
  const resolver = new ChainEntityResolver(privateResolverEnv, cache, prisma);
  // Private Mode is deterministic by design. It never spends provider AI
  // budget and never sends the user's question to OpenAI or Ollama.
  const ai = new AiService({ ...env, AI_PROVIDER: "fallback", OPENAI_API_KEY: undefined });
  const privateAnalysis = dependencies ?? {
    resolve: (type: ChainEntityType, value: string, options: ResolveOptions) => resolver.resolveWithSources(type, value, options),
    answer: (question: string, entity: NormalizedEntity) => ai.answer(question, entity)
  };

  app.post(
    "/v1/private/analyze",
    {
      config: {
        rateLimit: { max: env.RATE_LIMIT_PUBLIC_PER_HOUR, timeWindow: "1 hour" }
      }
    },
    async (request) => {
      if (!env.PRIVATE_MODE_ENABLED) {
        throw new AppError("PRIVATE_MODE_DISABLED", 503, "Private Mode is temporarily unavailable");
      }
      const body = analyzeBody.parse(request.body);
      let resolution: ResolvedEntity;
      try {
        resolution = await privateAnalysis.resolve(body.entityType, body.entity, {
          limit: 25,
          includeApprovals: false,
          privateMode: true
        });
      } catch (error) {
        if (error instanceof AppError && (error.statusCode === 400 || error.statusCode === 404)) throw error;
        throw new AppError("PROVIDER_UNAVAILABLE", 503, "Public chain data providers are temporarily unavailable");
      }
      const question = body.question ?? defaultQuestion(resolution.entity.type);
      const answer = await privateAnalysis.answer(question, resolution.entity);
      return {
        mode: "private" as const,
        entity: resolution.entity,
        answer,
        privacy: {
          accountRequired: false,
          walletConnectionRequired: false,
          serverStorage: "none" as const,
          browserStorage: "memory_only" as const,
          clearsOnReload: true,
          modelProvider: "none" as const,
          providerDestinations: resolution.providerDestinations,
          disclosure: "Only the public chain identifier is sent to the listed data providers. Your question is not sent to them or to a model provider."
        }
      };
    }
  );
}

function defaultQuestion(type: ChainEntityType): string {
  if (type === "transaction") return "Explain this transaction in plain English.";
  if (type === "wallet") return "Summarize this wallet's public Robinhood Chain activity.";
  if (type === "token") return "Explain this token and its evidence-based risk signals.";
  if (type === "contract") return "Explain what this contract is and what stands out.";
  return "Explain the available public Robinhood Chain facts.";
}
