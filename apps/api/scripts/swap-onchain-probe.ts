// Run manually from apps/api:
// node --env-file-if-exists=../../.env --import tsx scripts/swap-onchain-probe.ts
// Uses the configured read-only RPC and its existing daily/monthly guards.
import Redis from "ioredis";
import { loadEnv } from "../src/config/env.js";
import { createRobinhoodRpcSpendBudget } from "../src/chain/robinhood-rpc.js";
import { createExitCheckBudget } from "../src/exit-check/budget.js";
import { OnchainQuoteSource } from "../src/swap/onchain.js";
import { normalizeQuote, SwapQuoteProviderError } from "../src/swap/service.js";
import type { SwapPreviewDirection } from "../src/swap/constants.js";

const env = loadEnv();
const redis = env.REDIS_URL ? new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 }) : undefined;
redis?.on("error", () => undefined); // Never log connection details or credentials.
const source = new OnchainQuoteSource(env, {
  budget: createExitCheckBudget(env, redis), rpcSpend: createRobinhoodRpcSpendBudget(env, redis),
});
try {
  for (const [direction, sizes] of [
    ["WETH_TO_USDG", ["0.001", "0.01", "0.1"]],
    ["USDG_TO_WETH", ["5", "25", "100"]],
  ] satisfies Array<[SwapPreviewDirection, string[]]>) {
    for (const amount of sizes) {
      const request = { direction, amount };
      try {
        const quote = normalizeQuote(await source.requestQuote(request), request, Date.now());
        console.log(JSON.stringify({ direction, amount, output: quote.output, route: quote.route,
          priceImpactPercent: quote.priceImpactPercent, estimatedGas: quote.estimatedGas,
          onchain: quote.onchain, disclosures: quote.disclosures }));
      } catch (error) {
        console.log(JSON.stringify({ direction, amount, error: error instanceof SwapQuoteProviderError ? error.code : "probe_failed" }));
        process.exitCode = 1;
      }
    }
  }
} finally {
  redis?.disconnect();
}
