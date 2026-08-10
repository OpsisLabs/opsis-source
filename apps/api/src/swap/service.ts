import { formatEther, formatUnits, parseUnits } from "viem";
import { z } from "zod";
import { JsonCache } from "../cache/service.js";
import type { Env } from "../config/env.js";
import { ProviderHttpClient, ProviderRequestError, type ProviderHttp } from "../chain/provider-http.js";
import {
  PREVIEW_SWAPPER,
  SCOUT_SWAP_CHAIN_ID,
  SCOUT_SWAP_FRESHNESS_MS,
  SCOUT_SWAP_SLIPPAGE_PERCENT,
  UNISWAP_ROUTER_2_1_1,
  tokensForDirection,
  type ScoutSwapDirection
} from "./constants.js";

const rawAmount = z.string().regex(/^\d{1,78}$/);
const quoteToken = z.object({
  amount: rawAmount,
  token: z.string(),
  maximumAmount: rawAmount.optional(),
  minimumAmount: rawAmount.optional(),
  recipient: z.string().optional()
}).passthrough();

const rawQuoteSchema = z.object({
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

export type ScoutSwapRequest = {
  direction: ScoutSwapDirection;
  amount: string;
};

export type ScoutSwapQuote = {
  pair: "WETH/USDG";
  chain: { id: 4663; name: "Robinhood Chain" };
  input: { symbol: "WETH" | "USDG"; address: string; amount: string };
  output: { symbol: "WETH" | "USDG"; address: string; amount: string; minimumReceived: string };
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
  requestQuote(request: ScoutSwapRequest): Promise<unknown>;
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

  async requestQuote(request: ScoutSwapRequest): Promise<unknown> {
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
          tokenInChainId: SCOUT_SWAP_CHAIN_ID,
          tokenOutChainId: SCOUT_SWAP_CHAIN_ID,
          tokenIn: input.address,
          tokenOut: output.address,
          swapper: PREVIEW_SWAPPER,
          slippageTolerance: SCOUT_SWAP_SLIPPAGE_PERCENT,
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

export class ScoutSwapService {
  private readonly inflight = new Map<string, Promise<ScoutSwapQuote>>();

  constructor(
    private readonly env: Env,
    private readonly cache: JsonCache,
    private readonly source: SwapQuoteSource = new UniswapQuoteSource(env),
    private readonly now: () => number = Date.now
  ) {}

  async quote(request: ScoutSwapRequest): Promise<ScoutSwapQuote> {
    const { input } = tokensForDirection(request.direction);
    parseSwapAmount(request.amount, input.decimals);

    const key = `scout-swap:${request.direction}:${request.amount}`;
    const cached = await this.cache.get<ScoutSwapQuote>(key);
    if (cached && Date.parse(cached.expiresAt) > this.now()) {
      return {
        ...cached,
        freshForMs: Math.max(0, Date.parse(cached.expiresAt) - this.now()),
        provider: { ...cached.provider, cached: true }
      };
    }

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const operation = this.fetchAndNormalize(request)
      .then(async (quote) => {
        await this.cache.set(key, quote, this.env.UNISWAP_QUOTE_CACHE_SECONDS);
        return quote;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, operation);
    return operation;
  }

  private async fetchAndNormalize(request: ScoutSwapRequest): Promise<ScoutSwapQuote> {
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
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1_000_000_000) {
    throw new SwapQuoteProviderError("invalid_request");
  }
  try {
    return parseUnits(value, decimals);
  } catch {
    throw new SwapQuoteProviderError("invalid_request");
  }
}

export function normalizeQuote(raw: unknown, request: ScoutSwapRequest, now: number): ScoutSwapQuote {
  const parsed = rawQuoteSchema.safeParse(raw);
  if (!parsed.success) throw new SwapQuoteProviderError("malformed_response");
  const response = parsed.data;
  const { input, output } = tokensForDirection(request.direction);
  const quote = response.quote;
  if (!isSupportedSwapRoute(response.routing)) throw new SwapQuoteProviderError("malformed_response");
  if (quote.input.token.toLowerCase() !== input.address.toLowerCase() || quote.output.token.toLowerCase() !== output.address.toLowerCase()) {
    throw new SwapQuoteProviderError("malformed_response");
  }

  const requestedRaw = parseSwapAmount(request.amount, input.decimals).toString();
  const minimumRaw = quote.output.minimumAmount;
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
  const isUniswapX = response.routing.startsWith("DUTCH") || response.routing === "PRIORITY";
  const gasNative = quote.gasFee ? trimAmount(formatEther(BigInt(quote.gasFee)), 8) : null;
  // For UniswapX, classicGasUseEstimateUSD is a comparator for the classic
  // route—not the selected route's user cost—so it must never be relabeled.
  const gasUsd = quote.gasFeeUSD ?? null;
  const amount = trimAmount(formatUnits(BigInt(quote.input.amount), input.decimals), input.decimals);
  const outputAmount = trimAmount(formatUnits(BigInt(quote.output.amount), output.decimals), output.decimals);
  const minimumReceived = trimAmount(formatUnits(BigInt(minimumRaw), output.decimals), output.decimals);

  return {
    pair: "WETH/USDG",
    chain: { id: SCOUT_SWAP_CHAIN_ID, name: "Robinhood Chain" },
    input: { symbol: input.symbol, address: input.address, amount },
    output: { symbol: output.symbol, address: output.address, amount: outputAmount, minimumReceived },
    route: {
      routing: response.routing,
      label: routeLabel(response.routing, quote.routeString, input.symbol, output.symbol),
      protocols
    },
    priceImpactPercent: typeof quote.priceImpact === "number" ? quote.priceImpact : null,
    slippageTolerancePercent: SCOUT_SWAP_SLIPPAGE_PERCENT,
    estimatedGas: { nativeAmount: gasNative, usdAmount: gasUsd, paidBy: isUniswapX ? "filler_or_user" : "user" },
    simulation: { status: simulationStatus, reasons: failureReasons },
    approvalMayBeRequired: response.isTokenApprovalApplicable ?? true,
    transactionPreview: {
      explanationOnly: true,
      unsigned: true,
      chainId: SCOUT_SWAP_CHAIN_ID,
      sender: null,
      target: response.routing === "CLASSIC" ? UNISWAP_ROUTER_2_1_1 : null,
      action: isUniswapX
        ? `Create a fresh UniswapX order for ${amount} ${input.symbol} → ${output.symbol}`
        : `Execute an exact-input swap for ${amount} ${input.symbol} → at least ${minimumReceived} ${output.symbol}`,
      canSign: false,
      canBroadcast: false
    },
    quotedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SCOUT_SWAP_FRESHNESS_MS).toISOString(),
    freshForMs: SCOUT_SWAP_FRESHNESS_MS,
    provider: { name: "Uniswap", requestId: response.requestId, cached: false },
    handoffUrl: uniswapHandoffUrl(input.address, output.address, amount),
    disclosures: [
      "Uniswap fetches a new quote before execution; this preview is not a guaranteed price.",
      "You may pay network gas, liquidity-provider or protocol fees, price impact, slippage, and token-specific fees.",
      "Your wallet address is not sent for this preview; Uniswap receives the pair, amount, and a fixed non-user preview address.",
      "ChainScout cannot sign, approve, submit, or broadcast this transaction."
    ]
  };
}

function trimAmount(value: string, maxDecimals: number): string {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.slice(0, Math.min(maxDecimals, 8)).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole!;
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
