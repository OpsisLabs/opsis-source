import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { JsonCache } from "../cache/service.js";
import type { Env } from "../config/env.js";
import { AppError } from "../http/errors.js";
import { SwapPreviewService, SwapQuoteProviderError, type SwapQuoteSource } from "../swap/service.js";
import { OnchainQuoteSource } from "../swap/onchain.js";
import type { ExitCheckBudget } from "../exit-check/budget.js";
import type { RpcSpendBudget } from "../chain/robinhood-rpc.js";

const quoteBody = z.object({
  direction: z.enum(["WETH_TO_USDG", "USDG_TO_WETH", "ETH_TO_USDG", "USDG_TO_ETH"]),
  amount: z.string().min(1).max(40),
  slippageTolerancePercent: z.number().min(0.01).max(50).optional(),
}).strict();

export async function swapRoutes(
  app: FastifyInstance,
  env: Env,
  cache: JsonCache,
  source?: SwapQuoteSource,
  budgets?: { budget: ExitCheckBudget; rpcSpend: RpcSpendBudget },
): Promise<void> {
  const configured = source ?? (env.SWAP_QUOTE_SOURCE === "onchain" ? new OnchainQuoteSource(env, budgets) : undefined);
  const service = new SwapPreviewService(env, cache, configured);

  for (const path of ["/v1/swaps/quote", "/v1/private/trade-simulator/quote"]) app.post(path, {
    config: {
      rateLimit: { max: env.UNISWAP_QUOTE_RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute" }
    }
  }, async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    if (path.includes("trade-simulator") && !env.TRADE_SIMULATOR_ENABLED) {
      throw new AppError("TRADE_SIMULATOR_DISABLED", 503, "Trade Simulator is not enabled in this build");
    }
    if (!env.UNISWAP_QUOTE_ENABLED) {
      throw new AppError("SWAP_PREVIEW_DISABLED", 503, "Live swap previews are temporarily turned off");
    }
    const body = quoteBody.parse(request.body);
    try {
      return await service.quote(body);
    } catch (error) {
      if (!(error instanceof SwapQuoteProviderError)) throw error;
      if (error.code === "invalid_request") {
        throw new AppError("INVALID_SWAP_REQUEST", 400, "Enter a valid amount for the selected token");
      }
      if (error.code === "malformed_response") {
        throw new AppError("SWAP_PROVIDER_MALFORMED_RESPONSE", 503, "Uniswap returned an incomplete quote; no preview was shown");
      }
      if (error.code === "no_route") {
        throw new AppError("SWAP_NO_ROUTE", 422, "No supported quote was available for that amount; the official Uniswap app quotes independently");
      }
      if (error.code === "rate_limited") {
        throw new AppError("SWAP_RATE_LIMITED", 503, "Live quotes are cooling down after a provider rate limit");
      }
      throw new AppError("SWAP_PROVIDER_UNAVAILABLE", 503, "Uniswap live quotes are temporarily unavailable");
    }
  });
}
