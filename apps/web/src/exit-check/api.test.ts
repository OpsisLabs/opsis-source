import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getExitCheckQuote,
  isValidExitAmount,
  type ExitCheckQuote,
} from "./api";

const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

afterEach(() => vi.unstubAllGlobals());

function fixture(): ExitCheckQuote {
  const now = Date.now();
  return {
    schemaVersion: 1,
    supported: true,
    reason: "ok",
    chain: { id: 4663, name: "Robinhood Chain" },
    input: {
      contract: WETH.toLowerCase(),
      symbol: "WETH",
      decimals: 18,
      amount: "0.001",
      rawAmount: "1000000000000000",
    },
    output: { symbol: "USDG", address: USDG, decimals: 6 },
    quote: {
      pool: { fee: 100, pool: `0x${"a".repeat(40)}` },
      amountOut: "2567029",
      amountOutDisplay: "2.567029",
      spotAmountOut: "2566900",
      spotAmountOutDisplay: "2.5669",
      priceImpactBps: "0",
      priceImpactPercent: "0",
      feeTier: 100,
      feePercent: "0.01",
      feeAmount: "100000000000",
      feeAmountDisplay: "0.0000001",
      activeLiquidity: "12345678901234567890",
      fullExecutionProven: false,
    },
    coverage: {
      feeTiersTested: [100, 500, 3000, 10_000],
      poolsFound: [{ fee: 100, pool: `0x${"a".repeat(40)}` }],
      poolsQuoted: [
        {
          fee: 100,
          pool: `0x${"a".repeat(40)}`,
          amountOut: "2567029",
          amountOutDisplay: "2.567029",
        },
      ],
      poolsFailed: [],
      poolsMissing: [500, 3000, 10_000],
      poolsDiscoveryFailed: [],
    },
    anchor: {
      tag: "latest",
      blockNumber: 60401526,
      blockHash: `0x${"b".repeat(64)}`,
      timestamp: new Date(now).toISOString(),
      fetchedAt: new Date(now).toISOString(),
    },
    quotedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 30_000).toISOString(),
    freshForMs: 30_000,
    quoteIsNotSellabilityProof: true,
    limitations: [
      "A quote is not proof that the token can be transferred or sold.",
    ],
    provider: { name: "robinhood-public-rpc", cached: false },
  };
}

function mock(value: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Exit Check browser boundary", () => {
  it("sends only the token, amount, and output choice and accepts a consistent quote", async () => {
    const fetchMock = mock(fixture());
    await expect(
      getExitCheckQuote({ token: WETH, amount: "0.0010", outputToken: "USDG" }),
    ).resolves.toMatchObject({ supported: true, chain: { id: 4663 } });
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/private/exit-check/quote",
      expect.objectContaining({
        credentials: "omit",
        body: JSON.stringify({
          token: WETH,
          amount: "0.001",
          outputToken: "USDG",
        }),
      }),
    );
  });

  it("rejects inconsistent or unsupported quote shapes instead of showing them", async () => {
    const mismatchedOutput = fixture();
    mismatchedOutput.output = { ...mismatchedOutput.output!, address: WETH };
    mock(mismatchedOutput);
    await expect(
      getExitCheckQuote({ token: WETH, amount: "0.001", outputToken: "USDG" }),
    ).rejects.toThrow();

    const notProof = fixture();
    (
      notProof as { quoteIsNotSellabilityProof: boolean }
    ).quoteIsNotSellabilityProof = false;
    mock(notProof);
    await expect(
      getExitCheckQuote({ token: WETH, amount: "0.001", outputToken: "USDG" }),
    ).rejects.toThrow();

    const supportedWithNoQuote = { ...fixture(), quote: null };
    mock(supportedWithNoQuote);
    await expect(
      getExitCheckQuote({ token: WETH, amount: "0.001", outputToken: "USDG" }),
    ).rejects.toThrow();
  });

  it("requires a bounded exact curve when opted in", async () => {
    const base = fixture();
    const pool = base.quote!.pool;
    const point = (
      amount: string,
      rawAmount: string,
      out: string,
      display: string,
    ) => ({
      amount,
      rawAmount,
      status: "ok" as const,
      amountOut: out,
      amountOutDisplay: display,
      spotAmountOut: out,
      spotAmountOutDisplay: display,
      priceImpactBps: "0",
      priceImpactPercent: "0",
      feeTier: 100,
      feePercent: "0.01",
      feeAmount: String(BigInt(rawAmount) / 10000n),
      feeAmountDisplay:
        amount === "0.0005"
          ? "0.00000005"
          : amount === "0.002"
            ? "0.0000002"
            : "0.0000001",
      pool,
    });
    base.curve = {
      requestedAmount: "0.001",
      points: [
        point("0.0005", "500000000000000", "1283514", "1.283514"),
        point("0.001", "1000000000000000", "2567029", "2.567029"),
        point("0.002", "2000000000000000", "5134058", "5.134058"),
      ],
    };
    base.curve.points[1] = {
      ...base.curve.points[1]!,
      ...base.quote!,
      status: "ok",
    };
    mock(base);
    await expect(
      getExitCheckQuote({
        token: WETH,
        amount: "0.001",
        outputToken: "USDG",
        curve: true,
      }),
    ).resolves.toMatchObject({ curve: { points: expect.any(Array) } });

    const ignored = { ...base, curve: null };
    mock(ignored);
    await expect(
      getExitCheckQuote({
        token: WETH,
        amount: "0.001",
        outputToken: "USDG",
        curve: true,
      }),
    ).rejects.toThrow();
    const malformed = structuredClone(base);
    malformed.curve!.points[1]!.amountOutDisplay = "999";
    mock(malformed);
    await expect(
      getExitCheckQuote({
        token: WETH,
        amount: "0.001",
        outputToken: "USDG",
        curve: true,
      }),
    ).rejects.toThrow();
  });

  it("preserves genuine unsupported observations for an opted-in curve", async () => {
    const unsupported = {
      ...fixture(),
      supported: false,
      reason: "no_v3_pool",
      quote: null,
      output: null,
      curve: null,
    };
    mock(unsupported);
    await expect(
      getExitCheckQuote({
        token: WETH,
        amount: "0.001",
        outputToken: "USDG",
        curve: true,
      }),
    ).resolves.toMatchObject({ reason: "no_v3_pool" });
  });
  it("validates input amounts without floating point", () => {
    expect(isValidExitAmount("1.5", 18)).toBe(true);
    expect(isValidExitAmount("1.0000001", 6)).toBe(false);
    expect(isValidExitAmount("0", 18)).toBe(false);
    expect(isValidExitAmount("1e3", 18)).toBe(false);
    expect(isValidExitAmount("-1", 18)).toBe(false);
  });
});
