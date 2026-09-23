import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters } from "viem";
import { OBSERVED_TRADES_SWAP_TOPIC } from "../src/market/observed-trades.js";
import {
  PublicSwapCapture,
  type CapturedSwapLog,
  type SwapRangeRequest,
  type SwapRangeScan,
} from "../src/history/public-swap-capture.js";

const POOL = `0x${"11".repeat(20)}`;
const HASH = `0x${"aa".repeat(32)}`;
const OTHER_HASH = `0x${"bb".repeat(32)}`;
const TX = `0x${"cc".repeat(32)}`;
const TOPIC_ADDRESS = `0x${"00".repeat(12)}${"22".repeat(20)}`;
const request: SwapRangeRequest = {
  chainId: 4663,
  poolAddress: POOL,
  fromBlock: 100n,
  toBlock: 101n,
  source: "reviewed-fixture",
};

function log(overrides: Partial<CapturedSwapLog> = {}): CapturedSwapLog {
  return {
    address: POOL,
    blockNumber: 101n,
    blockHash: HASH,
    transactionHash: TX,
    logIndex: 2,
    blockTimestamp: new Date("2026-09-23T12:00:00.000Z"),
    topics: [OBSERVED_TRADES_SWAP_TOPIC, TOPIC_ADDRESS, TOPIC_ADDRESS],
    data: encodeAbiParameters([
      { type: "int256" }, { type: "int256" }, { type: "uint160" },
      { type: "uint128" }, { type: "int24" },
    ], [-12345678901234567890n, 98765432109876543210n, 5n, 7n, -12]),
    ...overrides,
  };
}

function harness(scanResult: SwapRangeScan | Error, enabled = true) {
  const scan = vi.fn(async () => {
    if (scanResult instanceof Error) throw scanResult;
    return scanResult;
  });
  const ingestObservation = vi.fn(async (input: unknown) => input);
  const recordCoverage = vi.fn(async (input: unknown) => input);
  const capture = new PublicSwapCapture(
    { scan },
    { ingestObservation, recordCoverage } as any,
    enabled,
  );
  return { capture, scan, ingestObservation, recordCoverage };
}

describe("bounded public Swap capture preparation", () => {
  it("does not consult a source when capture is disabled or the request exceeds bounds", async () => {
    const disabled = harness({ state: "complete", toBlockHash: HASH, logs: [] }, false);
    await expect(disabled.capture.capture(request)).rejects.toThrow("disabled");
    expect(disabled.scan).not.toHaveBeenCalled();

    const enabled = harness({ state: "complete", toBlockHash: HASH, logs: [] });
    await expect(enabled.capture.capture({ ...request, toBlock: 200n })).rejects.toThrow("bounded");
    await expect(enabled.capture.capture({ ...request, source: "https://provider.example/key" })).rejects.toThrow("bounded");
    expect(enabled.scan).not.toHaveBeenCalled();
  });

  it("decodes exact signed Swap amounts and records COMPLETE only after ingestion", async () => {
    const h = harness({ state: "complete", toBlockHash: HASH, logs: [log()] });
    await expect(h.capture.capture(request)).resolves.toEqual({ status: "COMPLETE", rows: 1 });
    expect(h.ingestObservation).toHaveBeenCalledWith(expect.objectContaining({
      chainId: 4663,
      poolAddress: POOL,
      amount0: "-12345678901234567890",
      amount1: "98765432109876543210",
      sqrtPriceX96: "5",
      liquidity: "7",
      tick: -12,
    }));
    expect(h.recordCoverage).toHaveBeenCalledWith(expect.objectContaining({
      status: "COMPLETE", blockHash: HASH,
    }));
    expect(h.ingestObservation.mock.invocationCallOrder[0]).toBeLessThan(h.recordCoverage.mock.invocationCallOrder[0]);
  });

  it("distinguishes a complete empty scan from an incomplete scan", async () => {
    const empty = harness({ state: "complete", toBlockHash: HASH, logs: [] });
    await expect(empty.capture.capture(request)).resolves.toEqual({ status: "EMPTY", rows: 0 });
    expect(empty.recordCoverage).toHaveBeenCalledWith(expect.objectContaining({ status: "EMPTY", blockHash: HASH }));

    const gap = harness({ state: "gap" });
    await expect(gap.capture.capture(request)).resolves.toEqual({ status: "GAP", rows: 0 });
    expect(gap.recordCoverage).toHaveBeenCalledWith(expect.objectContaining({ status: "GAP", blockHash: null }));
    expect(gap.ingestObservation).not.toHaveBeenCalled();
  });

  it("records unavailable without retaining a provider exception or claiming emptiness", async () => {
    const h = harness(new Error("credential-in-upstream-url"));
    await expect(h.capture.capture(request)).resolves.toEqual({ status: "UNAVAILABLE", rows: 0 });
    expect(h.recordCoverage).toHaveBeenCalledWith(expect.objectContaining({
      status: "UNAVAILABLE", detail: "SOURCE_UNAVAILABLE",
    }));
    expect(h.ingestObservation).not.toHaveBeenCalled();
  });

  it("refuses malformed, duplicated and mismatched-block events before persisting", async () => {
    for (const logs of [
      [log({ topics: [`0x${"00".repeat(32)}`, TOPIC_ADDRESS, TOPIC_ADDRESS] })],
      [log(), log()],
      [log({ blockHash: OTHER_HASH })],
      [log({ removed: true })],
    ]) {
      const h = harness({ state: "complete", toBlockHash: HASH, logs });
      await expect(h.capture.capture(request)).resolves.toEqual({ status: "GAP", rows: 0 });
      expect(h.ingestObservation).not.toHaveBeenCalled();
      expect(h.recordCoverage).toHaveBeenCalledWith(expect.objectContaining({ status: "GAP" }));
    }
  });

  it("does not record COMPLETE when an event conflicts with retained evidence", async () => {
    const h = harness({ state: "complete", toBlockHash: HASH, logs: [log()] });
    h.ingestObservation.mockRejectedValueOnce(new Error("conflicting replay"));
    await expect(h.capture.capture(request)).resolves.toEqual({ status: "GAP", rows: 0 });
    expect(h.recordCoverage).toHaveBeenCalledWith(expect.objectContaining({ status: "GAP", blockHash: null }));
  });

  it("does not write COMPLETE or EMPTY coverage after the lease assertion fails", async () => {
    for (const logs of [[log()], []]) {
      const h = harness({ state: "complete", toBlockHash: HASH, logs });
      await expect(h.capture.capture(request, { assertLease: async () => { throw new Error("lease lost"); } })).rejects.toThrow("lease lost");
      expect(h.recordCoverage).not.toHaveBeenCalled();
      if (logs.length) expect(h.ingestObservation).toHaveBeenCalledTimes(1);
    }
  });
});
