import { describe, expect, it } from "vitest";
import { tokenHeading, actionAmount, feePercent, formatExactAmount, scaleRawAmount, receiptTransferObservations, transactionReceiptOutcome, transactionTimelineRows } from "./transactionTimeline";

describe("transaction observations", () => {
  it("validates receipt Transfer-shaped observations and caps rendered rows at 64", () => {
    const address = `0x${"a".repeat(40)}`;
    const valid = { emitter: address, from: address, to: address, rawAmount: "900719925474099312345", logIndex: "0" };
    const parsed = receiptTransferObservations({
      receiptTransferCoverage: "complete",
      receiptTransferEvents: [valid, { ...valid, rawAmount: "1e9" }, { ...valid, emitter: "bad" }],
    });
    expect(parsed).toEqual({ coverage: "partial", events: [valid] });
    expect(receiptTransferObservations({
      receiptTransferCoverage: "complete",
      receiptTransferEvents: [{ ...valid, emitter: "bad" }],
    })).toEqual({ coverage: "partial", events: [] });
    const overflow = receiptTransferObservations({
      receiptTransferCoverage: "complete",
      receiptTransferEvents: Array.from({ length: 70 }, (_, i) => ({ ...valid, logIndex: String(i) })),
    });
    expect(overflow).toEqual({ coverage: "capped", events: [] });
    expect(receiptTransferObservations({
      receiptTransferCoverage: "capped",
      receiptTransferEvents: Array.from({ length: 70 }, (_, i) => ({ ...valid, logIndex: String(i) })),
    })).toEqual({ coverage: "capped", events: [] });
    expect(receiptTransferObservations({
      receiptTransferCoverage: "unavailable",
      receiptTransferEvents: [valid],
    })).toEqual({ coverage: "unavailable", events: [] });
    expect(receiptTransferObservations({
      receiptTransferCoverage: "unrecognized",
      receiptTransferEvents: [valid],
    })).toEqual({ coverage: undefined, events: [] });
  });

  it("groups explicit facts into submitted, inclusion and receipt stages", () => {
    const hash = `0x${"a".repeat(64)}`;
    expect(transactionTimelineRows({
      from: `0x${"1".repeat(40)}`, to: `0x${"2".repeat(40)}`, valueEth: "0.25", status: "0x1",
      blockNumber: "0x7b", blockHash: hash, gasUsed: "0x5208",
      tokenTransfers: [{ value: "99" }], internalTransactions: [{ value: "88" }],
    })).toEqual([
      { stage: "submitted", key: "from", value: `0x${"1".repeat(40)}` },
      { stage: "submitted", key: "to", value: `0x${"2".repeat(40)}` },
      { stage: "submitted", key: "value", value: "0.25 ETH" },
      { stage: "inclusion", key: "block", value: "123" },
      { stage: "inclusion", key: "blockHash", value: hash },
      { stage: "receipt", key: "status", value: "success" },
      { stage: "receipt", key: "gas", value: "21000" },
    ]);
  });

  it("rejects malformed quantities and hashes while retaining valid fields", () => {
    expect(transactionTimelineRows({
      from: "0xsender", valueEth: "not a value", value: "0xgg", blockNumber: "0x2z",
      gasUsed: -1, blockHash: "0x123", status: "mystery",
    })).toEqual([{ stage: "receipt", key: "status", value: "unknown" }]);
  });

  it("keeps absent value unknown and does not infer a receipt result", () => {
    expect(transactionTimelineRows({ from: null, to: {}, status: "pending" })).toEqual([
      { stage: "receipt", key: "status", value: "pending" },
    ]);
  });

  it("maps receipt states to locale-neutral codes for the UI to translate", () => {
    expect(["0x1", "0x0", "ok", "error", "pending", "replaced", undefined].map(transactionReceiptOutcome))
      .toEqual(["success", "failed", "success", "failed", "pending", "unknown", "unknown"]);
  });

  it("uses raw wei only when the API has no formatted native value", () => {
    expect(transactionTimelineRows({ value: "0xde0b6b3a7640000", status: null })).toEqual([
      { stage: "submitted", key: "value", value: "1000000000000000000 wei" },
      { stage: "receipt", key: "status", value: "unknown" },
    ]);
  });
});

describe("exact action amounts", () => {
  it("leads with the token name and symbol without duplicating identical text", () => {
    expect(tokenHeading({ name: "WETH", symbol: "WETH" }, "Token")).toBe("WETH");
    expect(tokenHeading({ name: "Wrapped Ether", symbol: "WETH" }, "Token")).toBe("Wrapped Ether · WETH");
    expect(tokenHeading({ name: null, symbol: null }, "Token")).toBe("Token");
  });
  it("groups huge amounts and preserves small fractions exactly", () => {
    expect(formatExactAmount("900719925474099312345.000000000000000001")).toBe("900,719,925,474,099,312,345.000000000000000001");
    expect(scaleRawAmount("123450000", 6)).toBe("123.45");
    expect(scaleRawAmount("1", 18)).toBe("0.000000000000000001");
    expect(scaleRawAmount("0", 18)).toBe("0");
    expect(feePercent(30)).toBe("0.3");
    expect(feePercent(1)).toBe("0.01");
  });
  it("keeps missing precision and malformed or inconsistent values unknown", () => {
    for (const decimals of [null, -1, 256, 1.5]) expect(scaleRawAmount("100", decimals)).toBeNull();
    for (const raw of ["1e9", "-1", "1.2", null]) expect(scaleRawAmount(raw, 6)).toBeNull();
    expect(formatExactAmount("1e9")).toBeNull();
    expect(feePercent(0.3)).toBeNull();
    expect(actionAmount({ rawAmount: "1000000", amount: "1", token: { decimals: 6 } })).toBe("1");
    expect(actionAmount({ rawAmount: "1000000", amount: "2", token: { decimals: 6 } })).toBeNull();
    expect(actionAmount({ rawAmount: "1", amount: null, token: { decimals: null } })).toBeNull();
  });
});
