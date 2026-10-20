import { formatEther, formatUnits, parseUnits } from "viem";
import { z } from "zod";
import { JsonCache } from "../cache/service.js";
import type { Env } from "../config/env.js";
import { ProviderHttpClient, ProviderRequestError, type ProviderHttp } from "../chain/provider-http.js";
import { OnchainQuoteSource } from "./onchain.js";
import {
  PREVIEW_SWAPPER,
  SWAP_PREVIEW_CHAIN_ID,
  SWAP_PREVIEW_FRESHNESS_MS,
  SWAP_PREVIEW_SLIPPAGE_PERCENT,
  UNISWAP_ROUTER_2_1_1,
  tokensForDirection,
  type SwapPreviewDirection
} from "./constants.js";

const rawAmount = z.string().regex(/^\d{1,78}$/);
const feeTierSchema = z.union([z.literal(100), z.literal(500), z.literal(3000), z.literal(10000)]);
const decimalAmount = z.string().max(120).regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
const poolAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine((value) => !/^0x0{40}$/i.test(value));
const feeTierResultSchema = z.discriminatedUnion("status", [
  z.object({ feeTier: feeTierSchema, status: z.literal("no_pool"), reason: z.literal("pool_not_found") }),
  z.object({ feeTier: feeTierSchema, poolAddress, lpFeeAmount: decimalAmount, status: z.literal("quote_refused"),
    reason: z.enum(["read_failed", "invalid_response", "pool_locked", "price_boundary", "zero_output", "invalid_gas_estimate"]) }),
  z.object({ feeTier: feeTierSchema, poolAddress, lpFeeAmount: decimalAmount, status: z.literal("quoted"),
    outputAmount: decimalAmount.refine((value) => /[1-9]/.test(value)),
    priceImpactPercent: z.number().finite().min(0).max(100).nullable(), highestOutput: z.boolean() }),
]);
export type SwapFeeTierResult = z.infer<typeof feeTierResultSchema>;

const onchainSchema = z.object({
  blockNumber: z.number().int().nonnegative().safe(),
  blockHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  capturedAtMs: z.number().int().nonnegative().safe(),
  poolAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  feeTier: feeTierSchema,
  feeTiers: z.array(feeTierResultSchema).min(1).max(4)
    .refine((rows) => new Set(rows.map((row) => row.feeTier)).size === rows.length).optional(),
  lpFeeAmount: z.string().regex(/^\d+(?:\.\d+)?$/),
  gasEstimate: rawAmount, gasPriceWei: rawAmount,
  networkFeeEth: z.string().regex(/^\d+(?:\.\d+)?$/),
  ethUsd: z.string().regex(/^\d+(?:\.\d+)?$/),
  ethUsdObservedAt: z.string().datetime(),
  nativeSide: z.enum(["input", "output"]).nullable(),
  rpcProvider: z.enum(["drpc", "robinhood-public-rpc"]),
});
const quoteToken = z.object({
  amount: rawAmount,
  token: z.string(),
  maximumAmount: rawAmount.optional(),
  minimumAmount: rawAmount.optional(),
  recipient: z.string().optional()
}).passthrough();

const rawQuoteSchema = z.object({
  onchain: onchainSchema.optional(),
  requestId: z.string().min(1),
  routing: z.enum(["CLASSIC", "DUTCH_LIMIT", "DUTCH_V2", "DUTCH_V3", "BRIDGE", "LIMIT_ORDER", "PRIORITY", "WRAP", "UNWRAP", "CHAINED"]),
  isTokenApprovalApplicable: z.boolean().optional(),
  quote: z.object({
    input: quoteToken,
    output: quoteToken,
    routeString: z.string().optional(),
    route: z.array(z.array(z.object({ type: z.string().optional() }).passthrough())).optional(),
    priceImpact: z.number().finite().optional(),
    gasFee: rawAmount.optional(),
    gasFeeUSD: z.string().optional(),
    classicGasUseEstimateUSD: z.string().optional(),
    txFailureReason: z.string().max(240).optional(),
    txFailureReasons: z.array(z.string().max(240)).max(8).optional()
  }).passthrough()
});

export type SwapPreviewRequest = {
  direction: SwapPreviewDirection;
  amount: string;
  slippageTolerancePercent?: number;
};

export type SwapPreviewQuote = {
  onchain?: z.infer<typeof onchainSchema>;
  pair: "WETH/USDG";
  chain: { id: 4663; name: "Robinhood Chain" };
  input: { symbol: "WETH" | "USDG"; address: string; amount: string };
  output: {
    symbol: "WETH" | "USDG";
    address: string;
    amount: string;
    minimumReceived: string;
    minimumSource: "provider" | "derived_tolerance";
  };
  route: { routing: string; label: string; protocols: string[] };
  priceImpactPercent: number | null;
  slippageTolerancePercent: number;
  estimatedGas: { nativeAmount: string | null; usdAmount: string | null; paidBy: "user" | "filler_or_user" };
  simulation: { status: "passed" | "warning" | "failed"; reasons: string[] };
  approvalMayBeRequired: boolean;
  transactionPreview: {
    explanationOnly: true;
    unsigned: true;
    chainId: 4663;
    sender: string | null;
    target: string | null;
    action: string;
    canSign: false;
    canBroadcast: false;
  };
  quotedAt: string;
  expiresAt: string;
  freshForMs: number;
  provider: { name: "Uniswap"; requestId: string; cached: boolean };
  handoffUrl: string;
  disclosures: string[];
};

export class SwapQuoteProviderError extends Error {
  constructor(public readonly code: "rate_limited" | "no_route" | "unavailable" | "invalid_request" | "malformed_response") {
    super(code);
  }
}

export interface SwapQuoteSource {
  requestQuote(request: SwapPreviewRequest): Promise<unknown>;
}

export class UniswapQuoteSource implements SwapQuoteSource {
  private pausedUntil = 0;
  private readonly http: ProviderHttp;

  constructor(
    private readonly env: Env,
    http?: ProviderHttp,
    private readonly now: () => number = Date.now
  ) {
    this.http = http ?? new ProviderHttpClient({
      maxRetries: 0,
      backoffMs: 1,
      timeoutMs: env.UNISWAP_QUOTE_TIMEOUT_MS,
      circuitFailureThreshold: 2,
      circuitResetMs: 60_000,
      requestBudgetPerMinute: env.UNISWAP_QUOTE_BUDGET_PER_MINUTE,
      maxConcurrency: 2,
      providerName: "uniswap"
    });
  }

  async requestQuote(request: SwapPreviewRequest): Promise<unknown> {
    if (request.direction === "ETH_TO_USDG" || request.direction === "USDG_TO_ETH") throw new SwapQuoteProviderError("invalid_request");
    if (this.now() < this.pausedUntil) throw new SwapQuoteProviderError("rate_limited");
    if (!this.env.UNISWAP_API_KEY) throw new SwapQuoteProviderError("unavailable");
    const { input, output } = tokensForDirection(request.direction);
    const amount = parseSwapAmount(request.amount, input.decimals);

    try {
      return await this.http.requestJson(`${this.env.UNISWAP_API_BASE_URL.replace(/\/$/, "")}/quote`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-api-key": this.env.UNISWAP_API_KEY,
          "x-universal-router-version": "2.1.1"
        },
        body: JSON.stringify({
          type: "EXACT_INPUT",
          amount: amount.toString(),
          tokenInChainId: SWAP_PREVIEW_CHAIN_ID,
          tokenOutChainId: SWAP_PREVIEW_CHAIN_ID,
          tokenIn: input.address,
          tokenOut: output.address,
          swapper: PREVIEW_SWAPPER,
          slippageTolerance: swapSlippagePercent(request),
          routingPreference: "BEST_PRICE",
          permitAmount: "EXACT"
        })
      });
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        if (error.code === "PROVIDER_HTTP_429") {
          // The first upstream 429 immediately pauses every quote attempt for a
          // minute. This is deliberately stricter than retrying into a free cap.
          this.pausedUntil = this.now() + 60_000;
          throw new SwapQuoteProviderError("rate_limited");
        }
        if (error.code === "PROVIDER_HTTP_400" || error.code === "PROVIDER_HTTP_404") {
          throw new SwapQuoteProviderError("no_route");
        }
      }
      throw new SwapQuoteProviderError("unavailable");
    }
  }
}

export class SwapPreviewService {
  private readonly inflight = new Map<string, Promise<SwapPreviewQuote>>();

  constructor(
    private readonly env: Env,
    private readonly cache: JsonCache,
    private readonly source: SwapQuoteSource = configuredSwapQuoteSource(env),
    private readonly now: () => number = Date.now
  ) {}

  async quote(request: SwapPreviewRequest): Promise<SwapPreviewQuote> {
    const { input } = tokensForDirection(request.direction);
    parseSwapAmount(request.amount, input.decimals);
    const slippage = swapSlippagePercent(request);

    const canonicalRequest = {
      ...request,
      amount: canonicalSwapAmount(request.amount)
    };

    const key = `swap-preview:${this.env.SWAP_QUOTE_SOURCE}:${canonicalRequest.direction}:${canonicalRequest.amount}:${slippage}`;
    const cached = await this.cache.get<SwapPreviewQuote>(key);
    if (cached && Date.parse(cached.expiresAt) > this.now()) {
      return {
        ...cached,
        freshForMs: Math.max(0, Date.parse(cached.expiresAt) - this.now()),
        provider: { ...cached.provider, cached: true }
      };
    }

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const operation = this.fetchAndNormalize(canonicalRequest)
      .then(async (quote) => {
        await this.cache.set(key, quote, this.env.UNISWAP_QUOTE_CACHE_SECONDS);
        return quote;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, operation);
    return operation;
  }

  private async fetchAndNormalize(request: SwapPreviewRequest): Promise<SwapPreviewQuote> {
    const raw = await this.source.requestQuote(request);
    return normalizeQuote(raw, request, this.now());
  }
}

export function parseSwapAmount(value: string, decimals: number): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || value.length > 40) {
    throw new SwapQuoteProviderError("invalid_request");
  }
  const fraction = value.split(".")[1];
  if (fraction && fraction.length > decimals) throw new SwapQuoteProviderError("invalid_request");
  try {
    const parsed = parseUnits(value, decimals);
    if (parsed <= 0n || parsed > parseUnits("1000000000", decimals)) {
      throw new SwapQuoteProviderError("invalid_request");
    }
    return parsed;
  } catch {
    throw new SwapQuoteProviderError("invalid_request");
  }
}

export function canonicalSwapAmount(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole!;
}

export function swapSlippagePercent(request: SwapPreviewRequest): number {
  const value = request.slippageTolerancePercent ?? SWAP_PREVIEW_SLIPPAGE_PERCENT;
  if (!Number.isFinite(value) || value < 0.01 || value > 50 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-8) {
    throw new SwapQuoteProviderError("invalid_request");
  }
  return value;
}

export function configuredSwapQuoteSource(env: Env): SwapQuoteSource {
  return env.SWAP_QUOTE_SOURCE === "onchain" ? new OnchainQuoteSource(env) : new UniswapQuoteSource(env);
}

export function normalizeQuote(raw: unknown, request: SwapPreviewRequest, now: number): SwapPreviewQuote {
  const parsed = rawQuoteSchema.safeParse(raw);
  if (!parsed.success) throw new SwapQuoteProviderError("malformed_response");
  const response = parsed.data;
  const onchain = response.onchain;
  const slippage = swapSlippagePercent(request);
  const captureTime = onchain?.capturedAtMs ?? now;
  if (captureTime > now || now - captureTime >= SWAP_PREVIEW_FRESHNESS_MS) throw new SwapQuoteProviderError("unavailable");
  const { input, output } = tokensForDirection(request.direction);
  const quote = response.quote;
  if (!isSupportedSwapRoute(response.routing)) throw new SwapQuoteProviderError("malformed_response");
  if (quote.input.token.toLowerCase() !== input.address.toLowerCase() || quote.output.token.toLowerCase() !== output.address.toLowerCase()) {
    throw new SwapQuoteProviderError("malformed_response");
  }

  const requestedRaw = parseSwapAmount(request.amount, input.decimals).toString();
  const isUniswapX = response.routing.startsWith("DUTCH") || response.routing === "PRIORITY";
  const minimumSource = quote.output.minimumAmount && !onchain ? "provider" : "derived_tolerance";
  // The current OAS makes minimumAmount optional and its CLASSIC example omits
  // it. For CLASSIC exact-input quotes only, the requested 0.5% tolerance has
  // normal AMM semantics, so a transparent preview floor can be derived. The
  // same inference is unsafe for UniswapX and therefore fails closed below.
  const minimumRaw = quote.output.minimumAmount ?? (
    response.routing === "CLASSIC" ? deriveClassicMinimum(quote.output.amount, slippage) : undefined
  );
  if (
    quote.input.amount !== requestedRaw ||
    !minimumRaw ||
    BigInt(quote.output.amount) <= 0n ||
    BigInt(minimumRaw) <= 0n ||
    BigInt(minimumRaw) > BigInt(quote.output.amount)
  ) {
    throw new SwapQuoteProviderError("malformed_response");
  }
  const protocols = routeProtocols(quote.route);
  const failureReasons = [
    ...(quote.txFailureReason ? [quote.txFailureReason] : []),
    ...(quote.txFailureReasons ?? [])
  ];
  const simulationStatus = failureReasons.length === 0
    ? "passed"
    : failureReasons.every(isPreviewSimulationLimitation)
      ? "warning"
      : "failed";
  const gasNative = onchain?.networkFeeEth ?? (quote.gasFee ? trimAmount(formatEther(BigInt(quote.gasFee)), 8) : null);
  // For UniswapX, classicGasUseEstimateUSD is a comparator for the classic
  // route—not the selected route's user cost—so it must never be relabeled.
  const gasUsd = quote.gasFeeUSD ?? null;
  const amount = request.amount;
  const outputAmount = trimAmount(formatUnits(BigInt(quote.output.amount), output.decimals), output.decimals);
  const minimumReceived = trimAmount(formatUnits(BigInt(minimumRaw), output.decimals), output.decimals);

  return {
    ...(onchain ? { onchain } : {}),
    pair: "WETH/USDG",
    chain: { id: SWAP_PREVIEW_CHAIN_ID, name: "Robinhood Chain" },
    input: { symbol: input.symbol, address: input.address, amount },
    output: {
      symbol: output.symbol,
      address: output.address,
      amount: outputAmount,
      minimumReceived,
      minimumSource
    },
    route: {
      routing: response.routing,
      label: routeLabel(response.routing, quote.routeString, input.symbol, output.symbol),
      protocols
    },
    priceImpactPercent: typeof quote.priceImpact === "number" ? quote.priceImpact : null,
    slippageTolerancePercent: slippage,
    estimatedGas: { nativeAmount: gasNative, usdAmount: gasUsd, paidBy: isUniswapX ? "filler_or_user" : "user" },
    simulation: onchain ? { status: "warning", reasons: ["Single-pool quote only; no wallet or full transaction simulation."] } : { status: simulationStatus, reasons: failureReasons },
    approvalMayBeRequired: response.isTokenApprovalApplicable ?? true,
    transactionPreview: {
      explanationOnly: true,
      unsigned: true,
      chainId: SWAP_PREVIEW_CHAIN_ID,
      sender: null,
      target: response.routing === "CLASSIC" ? UNISWAP_ROUTER_2_1_1 : null,
      action: isUniswapX
        ? `Create a fresh UniswapX order for ${amount} ${input.symbol} → ${output.symbol}`
        : `Execute an exact-input swap for ${amount} ${input.symbol} → at least ${minimumReceived} ${output.symbol}`,
      canSign: false,
      canBroadcast: false
    },
    quotedAt: new Date(captureTime).toISOString(),
    expiresAt: new Date(captureTime + SWAP_PREVIEW_FRESHNESS_MS).toISOString(),
    freshForMs: SWAP_PREVIEW_FRESHNESS_MS - (now - captureTime),
    provider: { name: "Uniswap", requestId: response.requestId, cached: false },
    handoffUrl: uniswapHandoffUrl(input.address, output.address, amount),
    disclosures: onchain ? [
      "Single-pool estimate. Uniswap's app may route differently and show a different price.",
      `Quote at block ${onchain.blockNumber}. Standard Uniswap V3 fee tiers only; no multi-pool routing, UniswapX or permit paths.`,
      "Network fee is an estimate you pay: QuoterV2 gas estimate × gas price observed at quote time. Approval, wrapping and chain-specific execution costs may be additional.",
      "Network fee USD uses Chainlink ETH / USD at the quote block. No sequencer-uptime feed is checked; oracle health coverage is limited.",
      "Price impact includes the pool fee against the same-block pre-fee spot price. The input-side LP fee is a floor estimate; exact charges can differ with V3 rounding.",
      ...(onchain.nativeSide ? [`Native ETH ${onchain.nativeSide} is estimated using WETH pools. The displayed pair and official-app prefill use WETH; wrapping or unwrapping is not quoted.`] : []),
      "You pay network, liquidity-provider and any protocol or token-specific fees. Minimum output is not a total-cost guarantee or proof of transferability.",
      `Only the pair, amount and public contract reads go to ${onchain.rpcProvider === "drpc" ? "the dRPC Robinhood Chain gateway. dRPC is a paid gateway that may route reads to independent node operators" : "Robinhood Public RPC"}. No wallet address is requested.`,
      "Opsis holds the pair and amount in a short quote cache for less than 30 seconds. No historical transaction or account is linked to it.",
      "Opsis cannot sign, approve, submit or broadcast. The official Uniswap app independently requotes and owns execution.",
    ] : [
      "Uniswap fetches a new quote before execution; this preview is not a guaranteed price.",
      "You may pay network gas, liquidity-provider or protocol fees, price impact, slippage, and token-specific fees.",
      "Your wallet address is not sent for this preview; Uniswap receives the pair, amount, and a fixed non-user preview address.",
      "Opsis may hold this pair and amount in a short quote cache for less than 30 seconds; no historical transaction or account is linked to it.",
      "Opsis cannot sign, approve, submit, or broadcast this transaction."
    ]
  };
}

function trimAmount(value: string, maxDecimals: number): string {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.slice(0, maxDecimals).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole!;
}

function deriveClassicMinimum(outputAmount: string, slippage: number): string {
  const slippageBps = BigInt(Math.round(slippage * 100));
  return ((BigInt(outputAmount) * (10_000n - slippageBps)) / 10_000n).toString();
}

function isSupportedSwapRoute(routing: z.infer<typeof rawQuoteSchema>["routing"]): boolean {
  return routing === "CLASSIC" || routing === "DUTCH_V2" || routing === "DUTCH_V3" || routing === "PRIORITY";
}

function isPreviewSimulationLimitation(reason: string): boolean {
  return reason === "UNSUPPORTED_SIMULATION" ||
    reason === "SIMULATION_UNAVAILABLE" ||
    /INSUFFICIENT_(?:TOKEN_)?BALANCE|INSUFFICIENT_ALLOWANCE/i.test(reason);
}

function routeProtocols(route: z.infer<typeof rawQuoteSchema>["quote"]["route"]): string[] {
  if (!route) return [];
  return [...new Set(route.flat().map((pool) => pool.type?.match(/v[234]/i)?.[0]?.toUpperCase()).filter((value): value is string => Boolean(value)))];
}

function routeLabel(routing: string, routeString: string | undefined, input: string, output: string): string {
  if (routeString) return routeString.slice(0, 180);
  if (routing === "DUTCH_V3") return `UniswapX v3 · ${input} → ${output}`;
  if (routing === "DUTCH_V2") return `UniswapX v2 · ${input} → ${output}`;
  if (routing === "PRIORITY") return `UniswapX priority · ${input} → ${output}`;
  return `Uniswap pools · ${input} → ${output}`;
}

function uniswapHandoffUrl(input: string, output: string, amount: string): string {
  const params = new URLSearchParams({
    chain: "robinhood",
    inputCurrency: input,
    outputCurrency: output,
    field: "input",
    value: amount,
    theme: "dark"
  });
  return `https://app.uniswap.org/swap?${params.toString()}`;
}
