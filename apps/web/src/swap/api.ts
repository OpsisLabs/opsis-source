import { privateApi } from "../dashboard/http";

export type SwapDirection = "WETH_TO_USDG" | "USDG_TO_WETH";

export type ScoutSwapQuote = {
  pair: "WETH/USDG";
  chain: { id: number; name: string };
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
    chainId: number;
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

export const SWAP_TOKENS = {
  WETH: { symbol: "WETH", name: "Wrapped Ether", address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", decimals: 18 },
  USDG: { symbol: "USDG", name: "Global Dollar", address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", decimals: 6 },
} as const;
const UNISWAP_ROUTER_2_1_1 = "0x8876789976decbfcbbbe364623c63652db8c0904";

export async function getScoutSwapQuote(request: {
  direction: SwapDirection;
  amount: string;
}, signal?: AbortSignal): Promise<ScoutSwapQuote> {
  const canonicalRequest = { ...request, amount: canonicalSwapAmount(request.amount) };
  const response = await privateApi<ScoutSwapQuote>("/v1/swaps/quote", canonicalRequest, signal);
  assertScoutSwapQuote(response, canonicalRequest);
  return response;
}

export function canonicalSwapAmount(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export function officialUniswapUrl(direction: SwapDirection, amount: string): string {
  const input = direction === "WETH_TO_USDG" ? SWAP_TOKENS.WETH : SWAP_TOKENS.USDG;
  const output = direction === "WETH_TO_USDG" ? SWAP_TOKENS.USDG : SWAP_TOKENS.WETH;
  const params = new URLSearchParams({
    chain: "robinhood",
    inputCurrency: input.address,
    outputCurrency: output.address,
    field: "input",
    value: amount || "0",
    theme: "dark",
  });
  return `https://app.uniswap.org/swap?${params.toString()}`;
}

function assertScoutSwapQuote(
  value: ScoutSwapQuote,
  request: { direction: SwapDirection; amount: string },
): void {
  const input = request.direction === "WETH_TO_USDG" ? SWAP_TOKENS.WETH : SWAP_TOKENS.USDG;
  const output = request.direction === "WETH_TO_USDG" ? SWAP_TOKENS.USDG : SWAP_TOKENS.WETH;
  const exactHandoff = officialUniswapUrl(request.direction, request.amount);
  const handoff = safeUrl(value?.handoffUrl);
  const expected = safeUrl(exactHandoff);
  const quotedAt = Date.parse(value?.quotedAt);
  const expiresAt = Date.parse(value?.expiresAt);
  const quoteWindow = expiresAt - quotedAt;
  const uniswapX = ["DUTCH_V2", "DUTCH_V3", "PRIORITY"].includes(value?.route?.routing);
  const expectedTarget = uniswapX ? null : UNISWAP_ROUTER_2_1_1;
  const expectedPaidBy = uniswapX ? "filler_or_user" : "user";
  const expectedAction = uniswapX
    ? `Create a fresh UniswapX order for ${request.amount} ${input.symbol} → ${output.symbol}`
    : `Execute an exact-input swap for ${request.amount} ${input.symbol} → at least ${value?.output?.minimumReceived} ${output.symbol}`;
  if (
    !value ||
    value.pair !== "WETH/USDG" ||
    value.chain?.id !== 4663 ||
    value.chain?.name !== "Robinhood Chain" ||
    value.input?.symbol !== input.symbol ||
    value.input?.address?.toLowerCase() !== input.address.toLowerCase() ||
    value.input?.amount !== request.amount ||
    value.output?.symbol !== output.symbol ||
    value.output?.address?.toLowerCase() !== output.address.toLowerCase() ||
    !positiveDecimal(value.output?.amount) ||
    !positiveDecimal(value.output?.minimumReceived) ||
    compareDecimals(value.output?.minimumReceived, value.output?.amount) > 0 ||
    !["provider", "derived_tolerance"].includes(value.output?.minimumSource) ||
    !["CLASSIC", "DUTCH_V2", "DUTCH_V3", "PRIORITY"].includes(value.route?.routing) ||
    !boundedText(value.route?.label, 180) ||
    (value.priceImpactPercent !== null && !finiteNumber(value.priceImpactPercent, 0, 100)) ||
    value.slippageTolerancePercent !== 0.5 ||
    !optionalNonnegativeDecimal(value.estimatedGas?.nativeAmount) ||
    !optionalNonnegativeDecimal(value.estimatedGas?.usdAmount) ||
    value.estimatedGas?.paidBy !== expectedPaidBy ||
    !["passed", "warning", "failed"].includes(value.simulation?.status) ||
    !Array.isArray(value.simulation?.reasons) ||
    value.simulation.reasons.some((reason) => typeof reason !== "string" || reason.length > 200) ||
    value.transactionPreview?.explanationOnly !== true ||
    value.transactionPreview?.unsigned !== true ||
    value.transactionPreview?.chainId !== 4663 ||
    value.transactionPreview?.sender !== null ||
    (expectedTarget === null
      ? value.transactionPreview?.target !== null
      : typeof value.transactionPreview?.target !== "string" ||
        value.transactionPreview.target.toLowerCase() !== expectedTarget) ||
    value.transactionPreview?.action !== expectedAction ||
    value.transactionPreview?.canSign !== false ||
    value.transactionPreview?.canBroadcast !== false ||
    value.provider?.name !== "Uniswap" ||
    !boundedText(value.provider?.requestId, 200) ||
    typeof value.provider?.cached !== "boolean" ||
    typeof value.approvalMayBeRequired !== "boolean" ||
    !Number.isFinite(value.freshForMs) ||
    value.freshForMs < 0 ||
    value.freshForMs > 30_000 ||
    !Number.isFinite(quotedAt) ||
    !Number.isFinite(expiresAt) ||
    quoteWindow <= 0 ||
    quoteWindow > 30_000 ||
    value.freshForMs > quoteWindow ||
    !Array.isArray(value.route?.protocols) ||
    value.route.protocols.length > 10 ||
    value.route.protocols.some((protocol) => !["V2", "V3", "V4"].includes(protocol)) ||
    !handoff ||
    !expected ||
    handoff.toString() !== expected.toString() ||
    !Array.isArray(value.disclosures) ||
    value.disclosures.length > 20 ||
    value.disclosures.some((item) => typeof item !== "string" || item.length > 500)
  ) {
    throw new Error("ChainScout returned an invalid live quote");
  }
}

function safeUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "app.uniswap.org" ||
      url.port ||
      url.username ||
      url.password ||
      url.hash
    ) return null;
    return url;
  } catch {
    return null;
  }
}

function positiveDecimal(value: unknown): value is string {
  return typeof value === "string" && value.length <= 120 && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) && /[1-9]/.test(value);
}

function optionalNonnegativeDecimal(value: unknown): boolean {
  return value === null || (
    typeof value === "string" && value.length <= 120 && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
  );
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function finiteNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function compareDecimals(left: unknown, right: unknown): number {
  if (typeof left !== "string" || typeof right !== "string") return 1;
  const [leftWhole, leftFraction = ""] = left.split(".");
  const [rightWhole, rightFraction = ""] = right.split(".");
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const leftValue = BigInt(`${leftWhole}${leftFraction.padEnd(scale, "0")}`);
  const rightValue = BigInt(`${rightWhole}${rightFraction.padEnd(scale, "0")}`);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}
