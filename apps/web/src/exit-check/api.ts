import { CHAINSCOUT_REVIEWED_ASSETS } from "@rh-chain/shared";
import { privateApi } from "../dashboard/http";
import { translateCurrent } from "../i18n/translate";

export type ExitCheckOutputSymbol = "WETH" | "USDG";

export type ExitCheckQuote = {
  schemaVersion: 1;
  supported: boolean;
  reason: "ok" | "no_v3_pool" | "unknown_decimals" | "quote_failed";
  chain: { id: number; name: string };
  input: {
    contract: string;
    symbol: string | null;
    decimals: number;
    amount: string;
    rawAmount: string;
  };
  output: {
    symbol: ExitCheckOutputSymbol;
    address: string;
    decimals: number;
  } | null;
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
  curve?: {
    requestedAmount: string;
    scope:
      | { strategy: "selected_pool"; pool: { fee: number; pool: string } }
      | { strategy: "no_selected_pool"; pool: null };
    points: Array<{
      amount: string;
      rawAmount: string;
      status: "ok" | "unavailable";
      reason?: string;
      amountOut: string | null;
      amountOutDisplay: string | null;
      spotAmountOut: string | null;
      spotAmountOutDisplay: string | null;
      priceImpactBps: string | null;
      priceImpactPercent: string | null;
      feeTier: number | null;
      feePercent: string | null;
      feeAmount: string | null;
      feeAmountDisplay: string | null;
      pool: { fee: number; pool: string } | null;
    }>;
  } | null;
  coverage: {
    feeTiersTested: number[];
    poolsFound: Array<{ fee: number; pool: string }>;
    poolsQuoted: Array<{
      fee: number;
      pool: string;
      amountOut: string;
      amountOutDisplay: string;
    }>;
    poolsFailed: Array<{ fee: number; pool: string; reason: string }>;
    poolsMissing: number[];
    poolsDiscoveryFailed: number[];
  };
  anchor: {
    tag: "latest";
    blockNumber: number;
    blockHash: string;
    timestamp: string;
    fetchedAt: string;
  };
  quotedAt: string;
  expiresAt: string;
  freshForMs: number;
  quoteIsNotSellabilityProof: true;
  limitations: string[];
  provider: { name: "robinhood-public-rpc"; cached: boolean };
};

export const EXIT_CHECK_TOKENS = CHAINSCOUT_REVIEWED_ASSETS;

export async function getExitCheckQuote(
  request: {
    token: string;
    amount: string;
    outputToken: ExitCheckOutputSymbol;
    curve?: boolean;
  },
  signal?: AbortSignal,
): Promise<ExitCheckQuote> {
  const canonical = {
    ...request,
    token: request.token.trim(),
    amount: canonicalExitAmount(request.amount),
    ...(request.curve ? { curve: true } : {}),
  };
  const response = await privateApi<ExitCheckQuote>(
    "/v1/private/exit-check/quote",
    canonical,
    signal,
  );
  assertExitCheckQuote(response, canonical);
  return response;
}

export function canonicalExitAmount(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export function isValidExitAmount(value: string, decimals: number): boolean {
  return (
    typeof value === "string" &&
    value.length <= 80 &&
    /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) &&
    /[1-9]/.test(value) &&
    (value.split(".")[1]?.length ?? 0) <= decimals
  );
}

function assertExitCheckQuote(
  value: ExitCheckQuote,
  request: {
    token: string;
    amount: string;
    outputToken: ExitCheckOutputSymbol;
    curve?: boolean;
  },
): void {
  const output = EXIT_CHECK_TOKENS[request.outputToken];
  const quotedAt = Date.parse(value?.quotedAt);
  const expiresAt = Date.parse(value?.expiresAt);
  const window = expiresAt - quotedAt;
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.chain?.id !== 4663 ||
    value.chain?.name !== "Robinhood Chain" ||
    value.input?.contract?.toLowerCase() !== request.token.toLowerCase() ||
    value.input?.amount !== request.amount ||
    !Number.isInteger(value.input?.decimals) ||
    value.input.decimals < 0 ||
    value.input.decimals > 36 ||
    !isHexAddress(value.input?.contract) ||
    typeof value.quoteIsNotSellabilityProof !== "boolean" ||
    value.quoteIsNotSellabilityProof !== true ||
    !Array.isArray(value.limitations) ||
    value.limitations.some(
      (item) => typeof item !== "string" || item.length > 500,
    ) ||
    value.provider?.name !== "robinhood-public-rpc" ||
    typeof value.provider?.cached !== "boolean" ||
    !Number.isFinite(quotedAt) ||
    !Number.isFinite(expiresAt) ||
    window <= 0 ||
    window > 30_000 ||
    value.freshForMs !== 30_000 ||
    !value.anchor ||
    value.anchor.tag !== "latest" ||
    !Number.isInteger(value.anchor.blockNumber) ||
    !/^0x[0-9a-fA-F]{64}$/.test(String(value.anchor.blockHash)) ||
    !Array.isArray(value.coverage?.feeTiersTested) ||
    !Array.isArray(value.coverage?.poolsFound) ||
    !Array.isArray(value.coverage?.poolsQuoted) ||
    !Array.isArray(value.coverage?.poolsFailed) ||
    !Array.isArray(value.coverage?.poolsMissing) ||
    !Array.isArray(value.coverage?.poolsDiscoveryFailed) ||
    (value.curve !== undefined &&
      value.curve !== null &&
      (!Array.isArray(value.curve.points) ||
        value.curve.requestedAmount !== request.amount))
  ) {
    throw new Error(translateCurrent("exit.error.invalidQuote"));
  }
  if (request.curve && value.supported && !value.curve)
    throw new Error(translateCurrent("exit.error.invalidQuote"));
  if (!request.curve && value.curve)
    throw new Error(translateCurrent("exit.error.invalidQuote"));
  if (value.curve) {
    const fail = () => {
      throw new Error(translateCurrent("exit.error.invalidQuote"));
    };
    const uint = (x: unknown): x is string =>
      typeof x === "string" &&
      /^(0|[1-9]\d{0,77})$/.test(x) &&
      BigInt(x) < 1n << 256n;
    if (
      !value.curve.scope ||
      (value.curve.scope.strategy === "selected_pool" &&
        (!value.curve.scope.pool ||
          ![100, 500, 3000, 10000].includes(value.curve.scope.pool.fee) ||
          !isHexAddress(value.curve.scope.pool.pool))) ||
      (value.curve.scope.strategy === "no_selected_pool" &&
        value.curve.scope.pool !== null) ||
      !["selected_pool", "no_selected_pool"].includes(
        value.curve.scope.strategy,
      )
    )
      fail();
    if (
      !uint(value.input.rawAmount) ||
      BigInt(value.input.rawAmount) === 0n ||
      formatRaw(BigInt(value.input.rawAmount), value.input.decimals) !==
        request.amount
    )
      fail();
    const requestedRaw = BigInt(value.input.rawAmount),
      max = (1n << 256n) - 1n;
    const expectedRaw = [
      ...new Set([
        requestedRaw / 2n || requestedRaw,
        requestedRaw,
        requestedRaw <= max / 2n ? requestedRaw * 2n : requestedRaw,
      ]),
    ];
    if (value.curve.points.length !== expectedRaw.length) fail();
    const scope = value.curve.scope;
    value.curve.points.forEach((point, index) => {
      if (
        !point ||
        point.rawAmount !== expectedRaw[index]!.toString() ||
        point.amount !== formatRaw(expectedRaw[index]!, value.input.decimals)
      )
        fail();
      if (point.status === "unavailable") {
        if (
          [
            point.amountOut,
            point.amountOutDisplay,
            point.spotAmountOut,
            point.spotAmountOutDisplay,
            point.priceImpactBps,
            point.priceImpactPercent,
            point.feeTier,
            point.feePercent,
            point.feeAmount,
            point.feeAmountDisplay,
            point.pool,
          ].some((x) => x !== null)
        )
          fail();
        return;
      }
      if (scope.strategy === "no_selected_pool") fail();
      if (
        point.status !== "ok" ||
        !uint(point.amountOut) ||
        BigInt(point.amountOut!) === 0n ||
        !uint(point.spotAmountOut) ||
        !uint(point.feeAmount) ||
        ![100, 500, 3000, 10000].includes(point.feeTier!) ||
        !isHexAddress(point.pool?.pool) ||
        point.pool?.fee !== point.feeTier
      )
        fail();
      const amountOut = BigInt(point.amountOut!),
        spot = BigInt(point.spotAmountOut!),
        fee = BigInt(point.feeAmount!);
      if (
        !value.coverage.poolsFound.some(
          (pool) =>
            pool?.fee === point.feeTier &&
            typeof pool.pool === "string" &&
            pool.pool.toLowerCase() === point.pool!.pool.toLowerCase(),
        )
      )
        fail();
      if (
        scope.strategy === "selected_pool" &&
        (point.pool!.fee !== scope.pool.fee ||
          point.pool!.pool.toLowerCase() !== scope.pool.pool.toLowerCase())
      )
        fail();
      if (
        point.amountOutDisplay !== formatRaw(amountOut, output.decimals) ||
        point.spotAmountOutDisplay !== formatRaw(spot, output.decimals) ||
        point.feeAmountDisplay !== formatRaw(fee, value.input.decimals) ||
        fee !== (expectedRaw[index]! * BigInt(point.feeTier!)) / 1000000n ||
        point.feePercent !== formatBps(BigInt(point.feeTier!) / 100n)
      )
        fail();
      const impact =
        spot === 0n
          ? null
          : spot > amountOut
            ? ((spot - amountOut) * 10000n) / spot
            : 0n;
      if (
        point.priceImpactBps !== (impact === null ? null : String(impact)) ||
        point.priceImpactPercent !==
          (impact === null ? null : formatBps(impact))
      )
        fail();
    });
    const requested = value.curve.points.find(
      (point) => point.rawAmount === value.input.rawAmount,
    )!;
    if (value.supported) {
      if (
        !value.quote ||
        requested.status !== "ok" ||
        scope.strategy !== "selected_pool"
      )
        fail();
      for (const field of [
        "amountOut",
        "amountOutDisplay",
        "spotAmountOut",
        "spotAmountOutDisplay",
        "priceImpactBps",
        "priceImpactPercent",
        "feeTier",
        "feePercent",
        "feeAmount",
        "feeAmountDisplay",
      ] as const)
        if (requested[field] !== value.quote![field]) fail();
      if (
        requested.pool!.pool.toLowerCase() !==
        value.quote!.pool.pool.toLowerCase()
      )
        fail();
    } else if (requested.status !== "unavailable") fail();
  }
  if (value.supported) {
    if (
      value.reason !== "ok" ||
      !value.output ||
      value.output.symbol !== request.outputToken ||
      value.output.address?.toLowerCase() !== output.address.toLowerCase() ||
      value.output.decimals !== output.decimals ||
      !value.quote ||
      !isPositiveDecimal(value.quote.amountOut) ||
      !isPositiveDecimal(value.quote.spotAmountOut) ||
      !Number.isInteger(value.quote.feeTier) ||
      value.quote.activeLiquidity === undefined ||
      typeof value.quote.activeLiquidity !== "string" ||
      value.quote.fullExecutionProven !== false
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
  return (
    typeof value === "string" &&
    value.length <= 120 &&
    /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) &&
    /[1-9]/.test(value)
  );
}

function formatRaw(raw: bigint, decimals: number): string {
  const text = raw.toString().padStart(decimals + 1, "0");
  if (decimals === 0) return text;
  const split = text.length - decimals;
  return `${text.slice(0, split)}.${text.slice(split)}`
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}

function formatBps(value: bigint): string {
  return formatRaw(value, 2);
}
