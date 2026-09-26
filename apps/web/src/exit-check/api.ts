import { CHAINSCOUT_REVIEWED_ASSETS } from "@rh-chain/shared";
import { privateApi } from "../dashboard/http";
import { translateCurrent } from "../i18n/translate";

export type ExitCheckOutputSymbol = "WETH" | "USDG";

export type ExitCheckQuote = {
  schemaVersion: 1;
  supported: boolean;
  reason: "ok" | "no_v3_pool" | "unknown_decimals" | "quote_failed";
  chain: { id: number; name: string };
  input: { contract: string; symbol: string | null; decimals: number; amount: string; rawAmount: string };
  output: { symbol: ExitCheckOutputSymbol; address: string; decimals: number } | null;
  quote: {
    pool: { fee: number; pool: string };
    amountOut: string;
    amountOutDisplay: string;
    spotAmountOut: string;
    spotAmountOutDisplay: string;
    priceImpactBps: string | null;
    priceImpactPercent: string | null;
    feeTier: number;
    feePercent: string;
    feeAmount: string;
    feeAmountDisplay: string;
    activeLiquidity: string;
    fullExecutionProven: false;
  } | null;
  coverage: {
    feeTiersTested: number[];
    poolsFound: Array<{ fee: number; pool: string }>;
    poolsQuoted: Array<{ fee: number; pool: string; amountOut: string; amountOutDisplay: string }>;
    poolsFailed: Array<{ fee: number; pool: string; reason: string }>;
    poolsMissing: number[];
    poolsDiscoveryFailed: number[];
  };
  anchor: { tag: "latest"; blockNumber: number; blockHash: string; timestamp: string; fetchedAt: string };
  quotedAt: string;
  expiresAt: string;
  freshForMs: number;
  quoteIsNotSellabilityProof: true;
  limitations: string[];
  provider: { name: ExitCheckProviderName; cached: boolean };
};

// The server's Robinhood Chain RPC transport: the public RPC in development,
// the admitted dRPC gateway in production. Any other provider fails closed.
export type ExitCheckProviderName = "robinhood-public-rpc" | "drpc";
const EXIT_CHECK_PROVIDER_NAMES: ReadonlySet<string> = new Set<ExitCheckProviderName>(["robinhood-public-rpc", "drpc"]);

export const EXIT_CHECK_TOKENS = CHAINSCOUT_REVIEWED_ASSETS;

export async function getExitCheckQuote(
  request: { token: string; amount: string; outputToken: ExitCheckOutputSymbol },
  signal?: AbortSignal,
): Promise<ExitCheckQuote> {
  const canonical = { ...request, token: request.token.trim(), amount: canonicalExitAmount(request.amount) };
  const response = await privateApi<ExitCheckQuote>("/v1/private/exit-check/quote", canonical, signal);
  assertExitCheckQuote(response, canonical);
  return response;
}

export function canonicalExitAmount(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export function isValidExitAmount(value: string, decimals: number): boolean {
  return typeof value === "string"
    && value.length <= 80
    && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
    && /[1-9]/.test(value)
    && (value.split(".")[1]?.length ?? 0) <= decimals;
}

function assertExitCheckQuote(value: ExitCheckQuote, request: { token: string; amount: string; outputToken: ExitCheckOutputSymbol }): void {
  const output = EXIT_CHECK_TOKENS[request.outputToken];
  const quotedAt = Date.parse(value?.quotedAt);
  const expiresAt = Date.parse(value?.expiresAt);
  const window = expiresAt - quotedAt;
  if (
    !value
    || value.schemaVersion !== 1
    || value.chain?.id !== 4663
    || value.chain?.name !== "Robinhood Chain"
    || value.input?.contract?.toLowerCase() !== request.token.toLowerCase()
    || value.input?.amount !== request.amount
    || !Number.isInteger(value.input?.decimals)
    || value.input.decimals < 0
    || value.input.decimals > 36
    || !isHexAddress(value.input?.contract)
    || typeof value.quoteIsNotSellabilityProof !== "boolean"
    || value.quoteIsNotSellabilityProof !== true
    || !Array.isArray(value.limitations)
    || value.limitations.some((item) => typeof item !== "string" || item.length > 500)
    || typeof value.provider?.name !== "string"
    || !EXIT_CHECK_PROVIDER_NAMES.has(value.provider.name)
    || typeof value.provider?.cached !== "boolean"
    || !Number.isFinite(quotedAt)
    || !Number.isFinite(expiresAt)
    || window <= 0
    || window > 30_000
    || value.freshForMs !== 30_000
    || !value.anchor
    || value.anchor.tag !== "latest"
    || !Number.isInteger(value.anchor.blockNumber)
    || !/^0x[0-9a-fA-F]{64}$/.test(String(value.anchor.blockHash))
    || !Array.isArray(value.coverage?.feeTiersTested)
    || !Array.isArray(value.coverage?.poolsFound)
    || !Array.isArray(value.coverage?.poolsQuoted)
    || !Array.isArray(value.coverage?.poolsFailed)
    || !Array.isArray(value.coverage?.poolsMissing)
    || !Array.isArray(value.coverage?.poolsDiscoveryFailed)
  ) {
    throw new Error(translateCurrent("exit.error.invalidQuote"));
  }
  if (value.supported) {
    if (
      value.reason !== "ok"
      || !value.output
      || value.output.symbol !== request.outputToken
      || value.output.address?.toLowerCase() !== output.address.toLowerCase()
      || value.output.decimals !== output.decimals
      || !value.quote
      || !isPositiveDecimal(value.quote.amountOut)
      || !isPositiveDecimal(value.quote.spotAmountOut)
      || !Number.isInteger(value.quote.feeTier)
      || value.quote.activeLiquidity === undefined
      || typeof value.quote.activeLiquidity !== "string"
      || value.quote.fullExecutionProven !== false
    ) {
      throw new Error(translateCurrent("exit.error.invalidQuote"));
    }
  } else if (value.quote !== null || value.output !== null) {
    throw new Error(translateCurrent("exit.error.invalidQuote"));
  }
}

function isHexAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isPositiveDecimal(value: unknown): value is string {
  return typeof value === "string" && value.length <= 120 && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) && /[1-9]/.test(value);
}
