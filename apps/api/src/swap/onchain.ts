import { decodeFunctionResult, encodeFunctionData, formatEther, formatUnits, parseUnits, type Hex } from "viem";
import type { Env } from "../config/env.js";
import { ProviderRequestError, type ProviderHttp } from "../chain/provider-http.js";
import { createRobinhoodRpcHttp, robinhoodRpcEndpoint, type RpcSpendBudget } from "../chain/robinhood-rpc.js";
import { createExitCheckBudget, type ExitCheckBudget } from "../exit-check/budget.js";
import { EXIT_CHECK_FEE_TIERS, UNISWAP_QUOTER_V2, UNISWAP_V3_FACTORY } from "../exit-check/constants.js";
import { factoryAbi, poolAbi, quoterAbi } from "../exit-check/service.js";
import { feeAmountRaw, isBoundarySqrtPrice, priceImpactBps, spotAmountOutRaw } from "../exit-check/math.js";
import { chainlinkAbi, ethUsdFeed, readChainlinkUsd } from "../rwa/chainlink.js";
import { SWAP_PREVIEW_FRESHNESS_MS, tokensForDirection } from "./constants.js";
import { parseSwapAmount, swapSlippagePercent, SwapQuoteProviderError, type SwapFeeTierResult, type SwapPreviewRequest, type SwapQuoteSource } from "./service.js";

type Read = { method: string; params: unknown[] };
type Result = { id: string; result?: unknown; error?: unknown };
type Dependencies = { rpc: ProviderHttp; budget: ExitCheckBudget; rpcSpend: RpcSpendBudget; now: () => number };
const quantity = (value: unknown): bigint => {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) throw new SwapQuoteProviderError("malformed_response");
  return BigInt(value);
};

/** Read-only, factory-verified single-pool quotes. No router or permit calls. */
export class OnchainQuoteSource implements SwapQuoteSource {
  private readonly rpc: ProviderHttp;
  private readonly budget: ExitCheckBudget;
  private readonly now: () => number;
  private pausedUntil = 0;
  private windowStarted = 0;
  private requests = 0;

  constructor(private readonly env: Env, dependencies: Partial<Dependencies> = {}) {
    this.now = dependencies.now ?? Date.now;
    this.budget = dependencies.budget ?? createExitCheckBudget(env);
    this.rpc = dependencies.rpc ?? createRobinhoodRpcHttp(env, {
      providerName: "swap-onchain-rpc",
      spend: dependencies.rpcSpend,
      client: { maxRetries: 0, timeoutMs: env.UNISWAP_QUOTE_TIMEOUT_MS, maxConcurrency: 2 },
    });
  }

  async requestQuote(request: SwapPreviewRequest): Promise<unknown> {
    const { input, output } = tokensForDirection(request.direction);
    const amountIn = parseSwapAmount(request.amount, input.decimals);
    const slippage = swapSlippagePercent(request);
    const capturedAtMs = this.now();
    if (capturedAtMs < this.pausedUntil) throw new SwapQuoteProviderError("rate_limited");
    if (capturedAtMs - this.windowStarted >= 60_000) { this.windowStarted = capturedAtMs; this.requests = 0; }
    if (this.requests >= this.env.UNISWAP_QUOTE_BUDGET_PER_MINUTE) throw new SwapQuoteProviderError("rate_limited");
    this.requests += 1;
    let units = 0;
    const batch = async (reads: Read[]): Promise<Result[]> => {
      units += reads.length;
      if (units > this.env.EXIT_CHECK_MAX_RPC_SUBCALLS) throw new SwapQuoteProviderError("rate_limited");
      try {
        await this.budget.consume(reads.length);
        const response = await this.rpc.requestJson(robinhoodRpcEndpoint(this.env).url, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify(reads.map((read, index) => ({ jsonrpc: "2.0", id: String(index), ...read }))),
        });
        if (!Array.isArray(response) || response.length !== reads.length) throw new SwapQuoteProviderError("malformed_response");
        const results = response as Result[];
        if (new Set(results.map((result) => result?.id)).size !== reads.length) throw new SwapQuoteProviderError("malformed_response");
        return reads.map((_, index) => {
          const result = results.find((item) => item?.id === String(index));
          if (!result || (!Object.hasOwn(result, "result") && !Object.hasOwn(result, "error"))) throw new SwapQuoteProviderError("malformed_response");
          return result;
        });
      } catch (error) {
        if (error instanceof SwapQuoteProviderError) throw error;
        const code = error instanceof Error && "code" in error ? String(error.code) : "";
        if (/429|BUDGET|LIMIT|SPEND_GUARD/.test(code)) {
          this.pausedUntil = this.now() + 60_000;
          throw new SwapQuoteProviderError("rate_limited");
        }
        throw new SwapQuoteProviderError("unavailable");
      }
    };
    const required = (result: Result): unknown => {
      if (result.error !== undefined || result.result === undefined || result.result === null) throw new SwapQuoteProviderError("unavailable");
      return result.result;
    };

    try {
      // eth_gasPrice has no historical block argument. Capture its suggestion
      // with the anchor, and disclose this distinction in the normalized quote.
      const initial = await batch([
        { method: "eth_getBlockByNumber", params: ["latest", false] },
        { method: "eth_chainId", params: [] },
        { method: "eth_gasPrice", params: [] },
      ]);
      if (quantity(required(initial[1]!)) !== 4663n) throw new SwapQuoteProviderError("unavailable");
      const anchor = required(initial[0]!) as { number?: unknown; hash?: unknown; timestamp?: unknown };
      const block = quantity(anchor.number), seconds = quantity(anchor.timestamp);
      if (block > BigInt(Number.MAX_SAFE_INTEGER) || seconds > BigInt(Math.floor(Number.MAX_SAFE_INTEGER / 1000)) ||
          typeof anchor.hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(anchor.hash) ||
          Math.abs(capturedAtMs - Number(seconds) * 1000) >= SWAP_PREVIEW_FRESHNESS_MS) throw new SwapQuoteProviderError("unavailable");
      const blockHex = `0x${block.toString(16)}`;
      const gasPrice = quantity(required(initial[2]!));
      const call = (to: string, data: Hex): Read => ({ method: "eth_call", params: [{ to, data }, blockHex] });
      const discovered = await batch(EXIT_CHECK_FEE_TIERS.map((fee) => call(UNISWAP_V3_FACTORY,
        encodeFunctionData({ abi: factoryAbi, functionName: "getPool", args: [input.address, output.address, fee] }))));
      // An errored discovery is never treated as an absent pool or a complete
      // comparison of standard tiers.
      const pools = discovered.flatMap((result, index) => {
        const address = decodeFunctionResult({ abi: factoryAbi, functionName: "getPool", data: required(result) as Hex });
        return /^0x0{40}$/i.test(address) ? [] : [{ address, fee: EXIT_CHECK_FEE_TIERS[index]! }];
      });
      if (!pools.length) throw new SwapQuoteProviderError("no_route");
      const feedCalls = (["description", "decimals", "latestRoundData"] as const).map((functionName) =>
        call(ethUsdFeed.proxyAddress, encodeFunctionData({ abi: chainlinkAbi, functionName })));
      const results = await batch([
        ...pools.flatMap((pool) => [
          call(pool.address, encodeFunctionData({ abi: poolAbi, functionName: "slot0" })),
          call(UNISWAP_QUOTER_V2, encodeFunctionData({ abi: quoterAbi, functionName: "quoteExactInputSingle", args: [{
            tokenIn: input.address, tokenOut: output.address, amountIn, fee: pool.fee, sqrtPriceLimitX96: 0n,
          }] })),
        ]),
        ...feedCalls,
      ]);
      let best: { pool: (typeof pools)[number]; amountOut: bigint; sqrtPrice: bigint; gas: bigint } | undefined;
      const tierResults = new Map<number, SwapFeeTierResult>();
      pools.forEach((pool, index) => {
        const base = { feeTier: pool.fee, poolAddress: pool.address.toLowerCase(),
          lpFeeAmount: formatUnits(feeAmountRaw(amountIn, pool.fee), input.decimals) };
        const refuse = (reason: Extract<SwapFeeTierResult, { status: "quote_refused" }>["reason"]) =>
          tierResults.set(pool.fee, { ...base, status: "quote_refused", reason });
        const slotResult = results[index * 2]!, quoteResult = results[index * 2 + 1]!;
        if (slotResult.error !== undefined || quoteResult.error !== undefined) { refuse("read_failed"); return; }
        try {
          const slot = decodeFunctionResult({ abi: poolAbi, functionName: "slot0", data: required(slotResult) as Hex });
          const quote = decodeFunctionResult({ abi: quoterAbi, functionName: "quoteExactInputSingle", data: required(quoteResult) as Hex });
          if (!slot[6]) { refuse("pool_locked"); return; }
          if (isBoundarySqrtPrice(slot[0]) || isBoundarySqrtPrice(quote[1])) { refuse("price_boundary"); return; }
          if (quote[0] <= 0n) { refuse("zero_output"); return; }
          if (quote[3] <= 0n) { refuse("invalid_gas_estimate"); return; }
          const impact = priceImpactBps({ spotAmountOut: spotAmountOutRaw({ amountInRaw: amountIn, sqrtPriceX96: slot[0],
            zeroForOne: input.address.toLowerCase() < output.address.toLowerCase() }), quotedAmountOut: quote[0] });
          tierResults.set(pool.fee, { ...base, status: "quoted", outputAmount: formatUnits(quote[0], output.decimals),
            priceImpactPercent: impact === null ? null : Number(impact) / 100, highestOutput: false });
          if (!best || quote[0] > best.amountOut) best = { pool, amountOut: quote[0], sqrtPrice: slot[0], gas: quote[3] };
        } catch { refuse("invalid_response"); }
      });
      if (!best) throw new SwapQuoteProviderError("no_route");
      // Reuse the feed's identity, round and age validation over the results
      // already fetched in the same pinned JSON-RPC batch; no extra reads.
      const feedResults = new Map(feedCalls.map((read, index) => [JSON.stringify(read.params), results[pools.length * 2 + index]!]));
      const feed = await readChainlinkUsd(async (method, params) => {
        if (method !== "eth_call") throw new Error("unexpected feed method");
        const result = feedResults.get(JSON.stringify(params));
        if (!result) throw new Error("unexpected feed read");
        return required(result);
      }, blockHex, Number(seconds), ethUsdFeed);
      const verified = required((await batch([{ method: "eth_getBlockByNumber", params: [blockHex, false] }]))[0]!) as { hash?: unknown };
      if (verified.hash !== anchor.hash || this.now() - capturedAtMs >= SWAP_PREVIEW_FRESHNESS_MS) throw new SwapQuoteProviderError("unavailable");
      const gasWei = best.gas * gasPrice;
      const gasUsd = gasWei * parseUnits(feed.priceUsd, ethUsdFeed.decimals);
      const impact = priceImpactBps({ spotAmountOut: spotAmountOutRaw({ amountInRaw: amountIn, sqrtPriceX96: best.sqrtPrice,
        zeroForOne: input.address.toLowerCase() < output.address.toLowerCase() }), quotedAmountOut: best.amountOut });
      const nativeSide = request.direction === "ETH_TO_USDG" ? "input" : request.direction === "USDG_TO_ETH" ? "output" : null;
      return {
        requestId: `onchain:${block}:${best.pool.address.toLowerCase()}`, routing: "CLASSIC", isTokenApprovalApplicable: true,
        quote: {
          input: { amount: amountIn.toString(), token: input.address },
          output: { amount: best.amountOut.toString(), token: output.address,
            minimumAmount: (best.amountOut * (10_000n - BigInt(Math.round(slippage * 100))) / 10_000n).toString() },
          routeString: `Uniswap v3 · single pool (fee ${best.pool.fee / 10_000}%)`, route: [[{ type: "v3-pool" }]],
          priceImpact: impact === null ? undefined : Number(impact) / 100,
          gasFee: gasWei.toString(), gasFeeUSD: formatUnits(gasUsd, 18 + ethUsdFeed.decimals),
        },
        onchain: {
          blockNumber: Number(block), blockHash: anchor.hash, capturedAtMs, poolAddress: best.pool.address.toLowerCase(),
          feeTier: best.pool.fee, lpFeeAmount: formatUnits(feeAmountRaw(amountIn, best.pool.fee), input.decimals),
          feeTiers: EXIT_CHECK_FEE_TIERS.map((feeTier): SwapFeeTierResult => {
            const result = tierResults.get(feeTier);
            return result?.status === "quoted" ? { ...result, highestOutput: feeTier === best!.pool.fee }
              : result ?? { feeTier, status: "no_pool", reason: "pool_not_found" };
          }),
          gasEstimate: best.gas.toString(), gasPriceWei: gasPrice.toString(), ethUsd: feed.priceUsd,
          ethUsdObservedAt: feed.observedAt, nativeSide, rpcProvider: robinhoodRpcEndpoint(this.env).id,
          networkFeeEth: formatEther(gasWei),
        },
      };
    } catch (error) {
      if (error instanceof SwapQuoteProviderError) throw error;
      if (error instanceof ProviderRequestError) throw new SwapQuoteProviderError("unavailable");
      throw new SwapQuoteProviderError("malformed_response");
    }
  }
}
